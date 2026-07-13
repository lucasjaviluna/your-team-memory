import { McpServer }         from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express                  from 'express'
import { checkConnection }      from './db/client.js'
import { checkOllamaConnection, checkChatModel } from './embeddings/ollama.js'
import { SaveMemorySchema,      saveMemory }      from './tools/save-memory.js'
import { UpdateMemorySchema,    updateMemory }    from './tools/update-memory.js'
import { SearchMemorySchema,    searchMemory }    from './tools/search-memory.js'
import { GetContextSchema,      getContext }      from './tools/get-context.js'
import { ListProjectsSchema,    listProjects }    from './tools/list-projects.js'
import { CompactMemorySchema,   compactMemory }   from './tools/compact-memory.js'
import { GetMemoryStatsSchema,  getMemoryStats }  from './tools/get-memory-stats.js'

const TRANSPORT  = process.env.MCP_TRANSPORT ?? 'stdio'
const PORT       = Number(process.env.MCP_PORT ?? 3100)
const IS_HTTP    = TRANSPORT === 'http'

// ── Registrar tools (compartido entre ambos transportes) ──────────────────────

function createMcpServer() {
  const server = new McpServer({
    name:    process.env.MCP_SERVER_NAME ?? 'team-memory',
    version: '1.0.0',
  })

  server.registerTool('save_memory', {
    description: `Save a new knowledge entry to the team memory.
Automatically checks for near-duplicates before inserting (exact title match or high RRF score).
If a duplicate is detected, returns saved: false with the existing entry and a suggestion.
The agent should then use update_memory on the existing entry, or call save_memory again
with force: true if the new entry is genuinely different.
SUMMARY and TASK_CONTEXT are excluded from the duplicate check — they are accumulative by nature.`,
    inputSchema: SaveMemorySchema,
  }, async (input) => {
    try {
      const result = await saveMemory(input)

      if (!result.saved) {
        // Duplicado detectado — no es un error, es información para el agente
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            saved: false,
            duplicate_detected: true,
            duplicate: result.duplicate,
            suggestion: result.suggestion,
          })}],
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: true,
          saved: true,
          id: result.entry!.id,
          message: `Memory saved: "${result.entry!.title}" [${result.entry!.type}] in ${result.entry!.area}`,
        })}],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })}],
        isError: true,
      }
    }
  })

  server.registerTool('update_memory', {
    description: 'Update an existing memory entry: replace or append content, change tags, or change status. Use this instead of save_memory when correcting, extending, or deprecating an entry that already exists. Cannot be used on archived entries.',
    inputSchema: UpdateMemorySchema,
  }, async (input) => {
    try {
      const entry = await updateMemory(input)
      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, id: entry.id,
        message: `Memory updated: "${entry.title}" [${entry.type}]`,
      })}] }
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({
        success: false, error: err instanceof Error ? err.message : String(err),
      })}], isError: true }
    }
  })

  server.registerTool('search_memory', {
    description: 'Search team knowledge using hybrid semantic + keyword search.',
    inputSchema: SearchMemorySchema,
  }, async (input) => {
    try {
      const results = await searchMemory(input)
      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, count: results.length, results,
      })}] }
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({
        success: false, error: err instanceof Error ? err.message : String(err),
      })}], isError: true }
    }
  })

  server.registerTool('get_context', {
    description: 'Load the full knowledge context for a project at the start of a session.',
    inputSchema: GetContextSchema,
  }, async (input) => {
    try {
      const context = await getContext(input)
      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, ...context,
      })}] }
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({
        success: false, error: err instanceof Error ? err.message : String(err),
      })}], isError: true }
    }
  })

  server.registerTool('list_projects', {
    description: 'List all projects that have memory entries.',
    inputSchema: ListProjectsSchema,
  }, async (input) => {
    try {
      const projects = await listProjects(input)
      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, count: projects.length, projects,
      })}] }
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({
        success: false, error: err instanceof Error ? err.message : String(err),
      })}], isError: true }
    }
  })

  server.registerTool('get_memory_stats', {
    description: `Return health metrics and access analytics for a project's memory.
Includes: entry breakdown by type/area/status, top accessed entries, never accessed entries,
access timeline, author activity, compaction candidates, and duplicate risk count.
Supports optional author filter (unverified text today). user_id filter is reserved
for future authenticated user tracking — currently ignored.`,
    inputSchema: GetMemoryStatsSchema,
  }, async (input) => {
    try {
      const stats = await getMemoryStats(input)
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, stats }) }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })}],
        isError: true,
      }
    }
  })

  server.registerTool('compact_memory', {
    description: 'Compact old low-access entries into SUMMARYs. Always dry_run first.',
    inputSchema: CompactMemorySchema,
  }, async (input) => {
    try {
      const result = await compactMemory(input)
      const message = result.dry_run
        ? `DRY RUN: would create ${result.summaries_created} SUMMARYs archiving ${result.entries_archived} entries.`
        : `Done: created ${result.summaries_created} SUMMARYs, archived ${result.entries_archived} entries.`
      return { content: [{ type: 'text', text: JSON.stringify({
        success: true, message, ...result,
      })}] }
    } catch (err) {
      return { content: [{ type: 'text', text: JSON.stringify({
        success: false, error: err instanceof Error ? err.message : String(err),
      })}], isError: true }
    }
  })

  return server
}

// ── Modo Streamable HTTP — red interna / VPN (sin auth, la red ya protege) ──
// Transporte recomendado actual del protocolo MCP (SSE quedó deprecado en
// la revisión de spec 2025-03-26). Un único endpoint /mcp maneja POST y GET.
// Modo stateless: cada request crea su propio server+transport — no hay
// sesiones que mantener viva, ideal para un servidor simple sin balanceador.

async function startStreamableHTTP() {
  const app = express()
  app.use(express.json())

  // Health check — útil para monitoreo interno y GitHub Actions
  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      transport: 'streamable-http',
      server:    process.env.MCP_SERVER_NAME ?? 'team-memory',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
    })
  })

  // Único endpoint MCP — POST para mensajes, GET no soportado en modo stateless
  app.post('/mcp', async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress
    try {
      const server = createMcpServer()
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless: sin sesión persistida entre requests
      })

      res.on('close', () => {
        transport.close()
        server.close()
      })

      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error(`[team-memory] ✗ /mcp error  ip:${clientIp}`, err)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    }
  })

  // GET y DELETE no aplican en modo stateless (no hay sesión que reanudar o cerrar)
  app.get('/mcp', (_req, res) => {
    res.status(405).json({ error: 'Method Not Allowed — this server runs in stateless mode' })
  })
  app.delete('/mcp', (_req, res) => {
    res.status(405).json({ error: 'Method Not Allowed — this server runs in stateless mode' })
  })

  app.listen(PORT, '0.0.0.0', () => {
    console.error(`[team-memory] 🚀 Streamable HTTP server  →  http://0.0.0.0:${PORT}`)
    console.error(`[team-memory]    /mcp      — endpoint MCP (POST)`)
    console.error(`[team-memory]    /health   — estado del servidor`)
    console.error(`[team-memory]    Acceso restringido por VPN / red interna`)
  })
}

// ── Modo stdio — desarrollo local ────────────────────────────────────────────

async function startStdio() {
  const server    = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[team-memory] 🚀 stdio transport ready')
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  console.error(`[team-memory] transport: ${TRANSPORT}`)

  const [dbOk, ollamaOk, chatOk] = await Promise.all([
    checkConnection(),
    checkOllamaConnection(),
    checkChatModel(),
  ])

  if (!dbOk) {
    console.error('[team-memory] ❌ PostgreSQL no disponible')
    process.exit(1)
  }

  console.error(`[team-memory] ✅ PostgreSQL conectado`)
  console.error(`[team-memory] ${ollamaOk ? '✅' : '⚠️ '} Ollama ${ollamaOk ? 'conectado' : 'no disponible'}`)
  console.error(`[team-memory] ${chatOk   ? '✅' : '⚠️ '} Chat model ${chatOk ? 'disponible' : 'no encontrado — compact_memory fallará'}`)
  console.error(`[team-memory] 🚀 7 tools: save_memory · update_memory · search_memory · get_context · list_projects · get_memory_stats · compact_memory`)

  IS_HTTP ? await startStreamableHTTP() : await startStdio()
}

main().catch(err => { console.error('[team-memory] Fatal:', err); process.exit(1) })
