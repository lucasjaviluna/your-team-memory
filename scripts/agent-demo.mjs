/**
 * agent-demo.mjs — Agente de IA que demuestra el uso completo de team-memory
 *
 * Usa la API de Anthropic (claude-sonnet-4-6) con tool_use para simular
 * exactamente cómo Claude Code usaría el sistema en una sesión real.
 *
 * El agente demuestra en orden:
 *  1. list_projects + get_context  → bootstrap de sesión
 *  2. search_memory                → búsqueda semántica con explicación del score
 *  3. save_memory + deduplicación  → intento de duplicado, respuesta del servidor, force
 *  4. update_memory                → append y add_tags sobre entrada existente
 *  5. get_memory_stats             → health del proyecto, autores, candidatos
 *  6. compact_memory dry_run       → análisis sin ejecutar
 *
 * Uso:
 *   node --env-file=.env scripts/agent-demo.mjs
 *   node --env-file=.env scripts/agent-demo.mjs --query="React state management"
 *   node --env-file=.env scripts/agent-demo.mjs --step=3   → solo un paso
 */

import Anthropic from '@anthropic-ai/sdk'

const CUSTOM_QUERY = process.argv.find(a => a.startsWith('--query='))?.split('=').slice(1).join('=')
  ?? process.argv[process.argv.indexOf('--query') + 1]

// ── Importar funciones del servidor directamente ──────────────────────────────

const { pool }           = await import('../packages/server/src/db/client.js')
const { saveMemory }     = await import('../packages/server/src/tools/save-memory.js')
const { updateMemory }   = await import('../packages/server/src/tools/update-memory.js')
const { searchMemory }   = await import('../packages/server/src/tools/search-memory.js')
const { getContext }     = await import('../packages/server/src/tools/get-context.js')
const { listProjects }   = await import('../packages/server/src/tools/list-projects.js')
const { getMemoryStats } = await import('../packages/server/src/tools/get-memory-stats.js')
const { compactMemory }  = await import('../packages/server/src/tools/compact-memory.js')

// ── Tool handlers — implementaciones reales del servidor ──────────────────────

const toolHandlers = {
  list_projects: async (input) => {
    const projects = await listProjects(input)
    return { success: true, count: projects.length, projects }
  },

  get_context: async (input) => {
    const result = await getContext(input)
    return { success: true, ...result }
  },

  search_memory: async (input) => {
    const results = await searchMemory(input)
    return {
      success: true, count: results.length,
      results: results.map(r => ({
        id: r.id, type: r.type, area: r.area,
        title: r.title,
        content: r.content.slice(0, 350) + (r.content.length > 350 ? '...' : ''),
        tags: r.tags, score: r.score,
        access_count: r.access_count,
        last_accessed: r.last_accessed,
      }))
    }
  },

  save_memory: async (input) => {
    const result = await saveMemory(input)
    if (!result.saved) {
      return {
        success: true,
        saved: false,
        duplicate_detected: true,
        duplicate: result.duplicate,
        suggestion: result.suggestion,
      }
    }
    return { success: true, saved: true, id: result.entry.id, message: `Saved: "${result.entry.title}" [${result.entry.type}]` }
  },

  update_memory: async (input) => {
    const entry = await updateMemory(input)
    return { success: true, id: entry.id, message: `Updated: "${entry.title}"`, status: entry.status, tags: entry.tags }
  },

  get_memory_stats: async (input) => {
    const stats = await getMemoryStats(input)
    return { success: true, stats }
  },

  compact_memory: async (input) => {
    const result = await compactMemory(input)
    const msg = result.dry_run
      ? `DRY RUN: would create ${result.summaries_created} SUMMARYs archiving ${result.entries_archived} entries.`
      : `Done: created ${result.summaries_created} SUMMARYs, archived ${result.entries_archived} entries.`
    return { success: true, message: msg, ...result }
  },
}

// ── Definición de tools para Anthropic API ────────────────────────────────────

const tools = [
  {
    name: 'list_projects',
    description: 'List all projects with memory entries. Use at session start to confirm what is available.',
    input_schema: {
      type: 'object',
      properties: { include_stats: { type: 'boolean' } },
    }
  },
  {
    name: 'get_context',
    description: 'Load full project context at session start. Returns SUMMARY and TASK_CONTEXT first (priority), then the rest ordered by type relevance.',
    input_schema: {
      type: 'object', required: ['project_slug'],
      properties: {
        project_slug: { type: 'string' },
        area:  { type: 'string', enum: ['frontend','backend','infra','general'] },
        limit: { type: 'number' },
      }
    }
  },
  {
    name: 'search_memory',
    description: 'Hybrid semantic + keyword search with RRF ranking. SUMMARY excluded by default unless type: SUMMARY is specified explicitly.',
    input_schema: {
      type: 'object', required: ['query'],
      properties: {
        query:        { type: 'string' },
        project_slug: { type: 'string' },
        area:         { type: 'string', enum: ['frontend','backend','infra','general'] },
        type:         { type: 'string', enum: ['BUG','FIX','DECISION','INSIGHT','PATTERN','ANTI_PATTERN','REPOSITORY_NOTE','TASK_CONTEXT','SUMMARY'] },
        limit:        { type: 'number' },
      }
    }
  },
  {
    name: 'save_memory',
    description: `Save a new knowledge entry. The server automatically checks for near-duplicates before inserting.
If duplicate_detected: true is returned, review duplicate.content_preview and either:
  - Use update_memory with duplicate.id if it covers the same topic
  - Call save_memory again with force: true if genuinely different
SUMMARY and TASK_CONTEXT are exempt from the duplicate check.`,
    input_schema: {
      type: 'object', required: ['project_slug','area','type','title','content','author'],
      properties: {
        project_slug: { type: 'string' },
        area:   { type: 'string', enum: ['frontend','backend','infra','general'] },
        type:   { type: 'string', enum: ['BUG','FIX','DECISION','INSIGHT','PATTERN','ANTI_PATTERN','REPOSITORY_NOTE','TASK_CONTEXT','SUMMARY'] },
        title:  { type: 'string' },
        content:{ type: 'string' },
        tags:   { type: 'array', items: { type: 'string' } },
        author: { type: 'string' },
        force:  { type: 'boolean', description: 'Skip duplicate check. Use only after reviewing the returned duplicate.' },
      }
    }
  },
  {
    name: 'update_memory',
    description: `Update an existing entry. Supports:
- content: full replacement
- append_content: add to the end (preserves original — preferred for extending)
- tags: replace all tags
- add_tags: merge new tags with existing
- status: change to active/deprecated/review_needed
Cannot update archived entries.`,
    input_schema: {
      type: 'object', required: ['entry_id'],
      properties: {
        entry_id:       { type: 'string' },
        content:        { type: 'string' },
        append_content: { type: 'string' },
        title:          { type: 'string' },
        tags:           { type: 'array', items: { type: 'string' } },
        add_tags:       { type: 'array', items: { type: 'string' } },
        status:         { type: 'string', enum: ['active','deprecated','review_needed'] },
      }
    }
  },
  {
    name: 'get_memory_stats',
    description: 'Get health metrics and access analytics for a project. Includes overview by type/area, top accessed entries, access timeline, author activity, compaction candidates, and duplicate risk.',
    input_schema: {
      type: 'object', required: ['project_slug'],
      properties: {
        project_slug:                 { type: 'string' },
        days:                         { type: 'number' },
        author:                       { type: 'string' },
        user_id:                      { type: 'string', description: 'Reserved for future auth — currently ignored' },
        include_never_accessed:       { type: 'boolean' },
        include_compaction_candidates:{ type: 'boolean' },
      }
    }
  },
  {
    name: 'compact_memory',
    description: 'Compact old, low-access entries into AI-generated SUMMARYs. Always use dry_run: true first, review the preview, then confirm with dry_run: false.',
    input_schema: {
      type: 'object', required: ['project_slug'],
      properties: {
        project_slug:            { type: 'string' },
        area:                    { type: 'string', enum: ['frontend','backend','infra','general'] },
        older_than_days:         { type: 'number' },
        max_access_count:        { type: 'number' },
        max_entries_per_summary: { type: 'number' },
        dry_run:                 { type: 'boolean' },
      }
    }
  },
]

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are a senior developer assistant with full access to the team-memory MCP system.

You are starting a demo session on the "ecommerce-platform" project. Execute each step carefully and explain your reasoning.

STEP 1 — SESSION BOOTSTRAP:
Call list_projects (include_stats: true) then get_context for "ecommerce-platform" (frontend area).
Explain what you found: how many entries, what types dominate, what SUMMARY/TASK_CONTEXT entries tell you about recent work.

STEP 2 — SEARCH WITH RRF ANALYSIS:
Search for: "${CUSTOM_QUERY || 'JWT authentication security issues and fixes'}"
Show the top 3 results. For each, explain:
- The RRF score meaning (what it says about vectorial vs FTS ranking)
- Why this entry ranks above the others
- Whether the access_count suggests the team finds it valuable

STEP 3 — DEDUPLICATION DEMO:
Try to save a new DECISION entry with title "DECISION: Use Zustand for state management".
When the server returns duplicate_detected: true, explain:
- What the duplicate is (show its content_preview)
- Why the server blocked it (exact match vs near-duplicate)
- What you would do: update_memory on the existing entry OR force: true
Then demonstrate the chosen action.

STEP 4 — UPDATE MEMORY:
Take the entry from step 3 (or the duplicate returned). Use update_memory to:
- Append a realistic update note with append_content
- Add 2 relevant new tags with add_tags
Explain why append_content is preferred over content replacement.

STEP 5 — GET MEMORY STATS:
Call get_memory_stats for the project. Analyze and explain:
- Which type/area has the most entries and why that makes sense
- Top accessed entries — what does that tell you about team priorities?
- Compaction candidates count — is the project healthy or needs maintenance?
- The authors breakdown and what the note about user_id means for the future

STEP 6 — COMPACTION ANALYSIS:
Run compact_memory with dry_run: true. Explain:
- How many candidates were found and why they qualify
- How the criteria (age + low access + not recently consulted) work together
- What would be lost vs preserved in the generated SUMMARYs
- Whether you would recommend running the real compaction now

Be technically precise. Show all tool calls and results. Format your analysis clearly.`

// ── Agent loop ────────────────────────────────────────────────────────────────

const client = new Anthropic()

function summarizeResult(toolName, result) {
  switch (toolName) {
    case 'list_projects':     return `${result.count} projects found`
    case 'get_context':       return `${result.total_entries} entries (${result.priority_entries?.length} priority)`
    case 'search_memory':     return `${result.count} results, top score: ${result.results?.[0]?.score?.toFixed(4) ?? 'N/A'}`
    case 'save_memory':       return result.saved ? `Saved: ${result.id?.slice(0,8)}...` : `Duplicate detected (score: ${result.duplicate?.score})`
    case 'update_memory':     return result.message
    case 'get_memory_stats':  return `${result.stats?.overview?.total_entries} total entries, ${result.stats?.health?.compaction_candidates_count} compaction candidates`
    case 'compact_memory':    return result.message
    default: return JSON.stringify(result).slice(0, 80)
  }
}

async function runAgent() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   team-memory — AI Agent Demo (7 tools)                      ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`Query: "${CUSTOM_QUERY || 'JWT authentication security issues and fixes'}"\n`)

  const messages = [{
    role: 'user',
    content: 'Start the team-memory demo session. Execute all 6 steps in order as described in the system prompt.'
  }]

  let step = 0

  while (true) {
    step++
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`Paso ${step} — Llamando a Claude...`)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM,
      tools,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log('\n🤖 Agente:\n')
        console.log(block.text)
      }
      if (block.type === 'tool_use') {
        console.log(`\n🔧 Tool: ${block.name}`)
        const inputPreview = JSON.stringify(block.input, null, 2).split('\n').slice(0, 8).join('\n  ')
        console.log(`   Input: ${inputPreview}${JSON.stringify(block.input, null, 2).split('\n').length > 8 ? '\n  ...' : ''}`)
      }
    }

    if (response.stop_reason === 'end_turn') {
      console.log('\n' + '═'.repeat(60))
      console.log('✅ Demo completa')
      break
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        console.log(`\n⚙️  Ejecutando ${block.name}...`)
        let result
        try {
          const handler = toolHandlers[block.name]
          if (!handler) throw new Error(`Tool desconocida: ${block.name}`)
          result = await handler(block.input)
          console.log(`   ✓ ${summarizeResult(block.name, result)}`)
        } catch (err) {
          result = { success: false, error: err.message }
          console.log(`   ✗ Error: ${err.message}`)
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }
      messages.push({ role: 'user', content: toolResults })
    }

    if (step > 20) {
      console.log('\n⚠️  Límite de pasos alcanzado')
      break
    }
  }

  await pool.end()
}

runAgent().catch(err => { console.error('Fatal:', err); process.exit(1) })
