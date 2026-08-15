import type { Request, Response, NextFunction } from 'express'
import { pool } from '../db/client.js'

export type Role = 'reader' | 'writer' | 'admin'

export interface AuthContext {
  user_id:     string
  username:    string
  role:        Role
  token_id:    string
  device_name: string | null
}

declare global {
  namespace Express {
    interface Request { auth?: AuthContext }
  }
}

const TOOL_PERMISSIONS: Record<string, Role> = {
  search_memory:      'reader',
  get_context:        'reader',
  list_projects:      'reader',
  get_memory_stats:   'reader',
  save_memory:        'writer',
  update_memory:      'writer',
  compact_memory:     'admin',
  delete_memory:      'admin',
}

const ROLE_HIERARCHY: Record<Role, number> = { reader: 0, writer: 1, admin: 2 }

export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.AUTH_ENABLED !== 'true') { next(); return }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header. Expected: Bearer <token>' }); return
  }

  const token = authHeader.slice(7)
  try {
    const result = await pool.query<{ token_id: string; user_id: string; username: string; role: Role; device_name: string | null }>(
      `SELECT t.id AS token_id, u.id AS user_id, u.username, u.role, t.device_name
       FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token = $1 AND t.revoked_at IS NULL AND u.revoked_at IS NULL`,
      [token]
    )
    if (result.rows.length === 0) { res.status(401).json({ error: 'Invalid or revoked token.' }); return }
    const ctx = result.rows[0]
    pool.query('UPDATE api_tokens SET last_used = now() WHERE id = $1', [ctx.token_id]).catch(() => {})
    req.auth = ctx
    next()
  } catch (err) {
    console.error('[auth] Error:', err)
    res.status(500).json({ error: 'Internal auth error' })
  }
}

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.AUTH_ENABLED !== 'true') { next(); return }
    if (!req.auth) { res.status(401).json({ error: 'Not authenticated' }); return }
    if (!hasPermission(req.auth.role, minRole)) {
      res.status(403).json({ error: `Forbidden. Required: ${minRole}. Your role: ${req.auth.role}` }); return
    }
    next()
  }
}

export function checkToolPermission(toolName: string, toolArgs: Record<string, unknown>, userRole: Role): { allowed: boolean; reason?: string } {
  if (process.env.AUTH_ENABLED !== 'true') return { allowed: true }
  if (toolName === 'compact_memory') {
    const isDryRun = toolArgs.dry_run !== false
    const required = isDryRun ? 'reader' : 'admin'
    if (!hasPermission(userRole, required))
      return { allowed: false, reason: `Role '${userRole}' cannot run compact_memory with dry_run: ${isDryRun}. Required: ${required}` }
    return { allowed: true }
  }
  const required = TOOL_PERMISSIONS[toolName]
  if (!required) return { allowed: true }
  if (!hasPermission(userRole, required))
    return { allowed: false, reason: `Role '${userRole}' cannot call '${toolName}'. Required: ${required}` }
  return { allowed: true }
}
