import { pool } from './client.js'

export type AccessTool = 'search_memory' | 'get_context'

export interface AccessContext {
  tool:    AccessTool
  author?: string   // texto libre hoy; user_id verificado en el futuro
  userId?: string   // reservado — null hasta que haya auth real
}

/**
 * Registra accesos de forma asíncrona (fire and forget via setImmediate).
 * Propaga author/userId al log para futuro tracking por usuario.
 */
export function logAccess(entryIds: string[], context: AccessTool | AccessContext): void {
  if (entryIds.length === 0) return

  // Acepta tanto el formato legacy (solo tool) como el nuevo (con contexto de usuario)
  const ctx: AccessContext = typeof context === 'string'
    ? { tool: context }
    : context

  setImmediate(async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // INSERT multi-row con author y user_id (nullable)
      const logValues = entryIds
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
        .join(', ')
      const logParams = entryIds.flatMap((id) => [id, ctx.tool, ctx.author ?? null])

      await client.query(
        `INSERT INTO memory_access_log (entry_id, tool, author) VALUES ${logValues}`,
        logParams
      )

      await client.query(
        `UPDATE memory_entries
         SET access_count  = access_count + 1,
             last_accessed = now()
         WHERE id = ANY($1::uuid[])`,
        [entryIds]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      console.error('[access-log] Error registering access:', err)
    } finally {
      client.release()
    }
  })
}
