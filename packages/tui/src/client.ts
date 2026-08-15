import type { MemoryEntry, MemoryStats, CompactResult, Area, EntryType, Status } from './types.js'

interface RpcResponse {
  jsonrpc: string
  id?:     number
  result?: { content: Array<{ type: string; text: string }> }
  error?:  { code: number; message: string }
}

let _id    = 1
let _init  = false
let _token: string | null = null   // token de autenticación, se setea al iniciar

// ── Configurar token globalmente ──────────────────────────────────────────────

export function setAuthToken(token: string | null): void {
  _token = token
  _init  = false   // reiniciar init si cambia el token
}

// ── HTTP base ─────────────────────────────────────────────────────────────────

async function post(url: string, body: object): Promise<RpcResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'application/json, text/event-stream',
  }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('text/event-stream')) {
    const text = await res.text()
    for (const line of text.split('\n'))
      if (line.startsWith('data: ')) return JSON.parse(line.slice(6)) as RpcResponse
    throw new Error('Empty SSE stream')
  }
  return res.json() as Promise<RpcResponse>
}

async function ensureInit(url: string) {
  if (_init) return
  await post(url, {
    jsonrpc: '2.0', id: _id++, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'memory-tui', version: '1.0.0' } },
  })
  _init = true
}

async function call<T>(url: string, name: string, args: object = {}): Promise<T> {
  await ensureInit(url)
  const r = await post(url, { jsonrpc: '2.0', id: _id++, method: 'tools/call', params: { name, arguments: args } })
  if (r.error) throw new Error(`MCP ${r.error.code}: ${r.error.message}`)
  const text = r.result?.content?.find(c => c.type === 'text')?.text
  if (!text) throw new Error(`No text from ${name}`)
  const parsed = JSON.parse(text)
  if (parsed.success === false) throw new Error(parsed.error ?? `${name} failed`)
  return parsed as T
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const u = baseUrl.replace(/\/mcp\/?$/, '/health')
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) })
    return r.ok
  } catch { return false }
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export async function apiGetStats(url: string, slug: string): Promise<MemoryStats> {
  const r = await call<{ stats: MemoryStats }>(url, 'get_memory_stats', {
    project_slug: slug, days: 30,
    include_never_accessed: true, include_compaction_candidates: true,
  })
  return r.stats
}

export async function apiGetContext(url: string, slug: string, area?: Area) {
  return call<{ priority_entries: MemoryEntry[]; entries: MemoryEntry[]; total_entries: number }>(
    url, 'get_context', { project_slug: slug, ...(area ? { area } : {}), limit: 30 })
}

export async function apiSearchMemory(url: string, args: {
  query: string; project_slug: string; type?: EntryType; area?: Area; limit?: number
}): Promise<MemoryEntry[]> {
  const r = await call<unknown>(url, 'search_memory', { limit: 20, ...args })
  return Array.isArray(r) ? r as MemoryEntry[] : ((r as { results?: MemoryEntry[] }).results ?? [])
}

export async function apiUpdateMemory(url: string, args: {
  entry_id: string; append_content?: string; add_tags?: string[]; status?: Status
}): Promise<MemoryEntry> {
  return call<MemoryEntry>(url, 'update_memory', args)
}

export async function apiCompactMemory(url: string, args: {
  project_slug: string; dry_run: boolean
  older_than_days?: number; max_access_count?: number; last_accessed_days?: number
}): Promise<CompactResult> {
  return call<CompactResult>(url, 'compact_memory', args)
}

export async function apiDeleteMemory(url: string, args: {
  entry_id: string; confirm: true
}): Promise<{ deleted: boolean; entry_id: string; title: string; type: string }> {
  return call(url, 'delete_memory', args)
}
