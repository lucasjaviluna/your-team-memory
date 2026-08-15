import { Router, type Request, type Response } from 'express'
import { randomBytes }                          from 'crypto'
import { pool }                                 from '../db/client.js'
import { requireAuth, requireRole, type Role }  from '../middleware/auth.js'

export const authRouter = Router()

function generateToken(prefix: string): string { return `${prefix}-${randomBytes(24).toString('hex')}` }
function generateInvite(): string { return `inv-${randomBytes(16).toString('hex')}` }

// POST /auth/bootstrap — primer admin (un solo uso)
authRouter.post('/bootstrap', async (req: Request, res: Response) => {
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!bootstrapToken) return void res.status(404).json({ error: 'Bootstrap not configured.' })
  const provided = req.headers.authorization?.replace('Bearer ', '')
  if (provided !== bootstrapToken) return void res.status(401).json({ error: 'Invalid bootstrap token.' })
  const existing = await pool.query('SELECT COUNT(*) AS n FROM users')
  if (Number(existing.rows[0].n) > 0) return void res.status(409).json({ error: 'Bootstrap already done.' })
  const { username, device_name, email } = req.body as { username: string; device_name?: string; email?: string }
  if (!username?.trim()) return void res.status(400).json({ error: 'username is required.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userResult = await client.query<{ id: string }>(`INSERT INTO users (username, email, role) VALUES ($1, $2, 'admin') RETURNING id`, [username.trim(), email ?? null])
    const userId = userResult.rows[0].id
    const token  = generateToken('sk-admin')
    const devName = device_name ?? 'unknown device'
    await client.query(`INSERT INTO api_tokens (token, user_id, device_name) VALUES ($1, $2, $3)`, [token, userId, devName])
    await client.query('COMMIT')
    res.json({ success: true, message: `Admin user '${username}' created.`, user: { id: userId, username, role: 'admin' }, token, device_name: devName })
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
})

// POST /auth/register — con invite token
authRouter.post('/register', async (req: Request, res: Response) => {
  const { invite_token, username, device_name, email } = req.body as { invite_token: string; username: string; device_name?: string; email?: string }
  if (!invite_token?.trim()) return void res.status(400).json({ error: 'invite_token is required.' })
  if (!username?.trim())    return void res.status(400).json({ error: 'username is required.' })
  const inviteResult = await pool.query<{ id: string; role: Role; expires_at: Date; used_at: Date | null }>(`SELECT id, role, expires_at, used_at FROM invite_tokens WHERE token = $1`, [invite_token.trim()])
  if (inviteResult.rows.length === 0) return void res.status(404).json({ error: 'Invite token not found.' })
  const invite = inviteResult.rows[0]
  if (invite.used_at) return void res.status(409).json({ error: 'Invite token already used.' })
  if (new Date() > invite.expires_at) return void res.status(410).json({ error: 'Invite token expired.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userResult = await client.query<{ id: string }>(`INSERT INTO users (username, email, role) VALUES ($1, $2, $3) RETURNING id`, [username.trim(), email ?? null, invite.role])
    const userId = userResult.rows[0].id
    const token  = generateToken(`sk-${invite.role}`)
    const devName = device_name ?? 'unknown device'
    await client.query(`INSERT INTO api_tokens (token, user_id, device_name) VALUES ($1, $2, $3)`, [token, userId, devName])
    await client.query(`UPDATE invite_tokens SET used_by = $1, used_at = now() WHERE id = $2`, [userId, invite.id])
    await client.query('COMMIT')
    res.json({ success: true, message: `User '${username}' registered.`, user: { id: userId, username, role: invite.role }, token, device_name: devName })
  } catch (err) {
    await client.query('ROLLBACK')
    if ((err as { code?: string }).code === '23505') return void res.status(409).json({ error: `Username '${username}' already exists.` })
    throw err
  } finally { client.release() }
})

// GET /auth/me
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ success: true, user: { id: req.auth!.user_id, username: req.auth!.username, role: req.auth!.role, device_name: req.auth!.device_name } })
})

// POST /auth/tokens/device — nuevo token para otro dispositivo
authRouter.post('/tokens/device', requireAuth, async (req: Request, res: Response) => {
  const { device_name } = req.body as { device_name?: string }
  const token = generateToken(`sk-${req.auth!.role}`)
  const devName = device_name ?? 'unknown device'
  await pool.query(`INSERT INTO api_tokens (token, user_id, device_name) VALUES ($1, $2, $3)`, [token, req.auth!.user_id, devName])
  res.json({ success: true, token, device_name: devName })
})

// POST /auth/invites — crear invite (admin)
authRouter.post('/invites', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { role = 'writer', expires_in_hours = 48 } = req.body as { role?: Role; expires_in_hours?: number }
  if (!['reader','writer','admin'].includes(role)) return void res.status(400).json({ error: `Invalid role: ${role}` })
  const token = generateInvite()
  const expiresAt = new Date(Date.now() + expires_in_hours * 3600 * 1000)
  await pool.query(`INSERT INTO invite_tokens (token, role, created_by, expires_at) VALUES ($1, $2, $3, $4)`, [token, role, req.auth!.user_id, expiresAt])
  res.json({ success: true, token, role, expires_at: expiresAt.toISOString(), usage: `npx github:tu-org/team-memory install --invite ${token}` })
})

// GET /auth/invites — listar invites (admin)
authRouter.get('/invites', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  const result = await pool.query(`SELECT i.token, i.role, i.expires_at, i.used_at, creator.username AS created_by, usedby.username AS used_by_username FROM invite_tokens i JOIN users creator ON creator.id = i.created_by LEFT JOIN users usedby ON usedby.id = i.used_by ORDER BY i.expires_at DESC`)
  res.json({ success: true, invites: result.rows })
})

// GET /auth/users — listar usuarios (admin)
authRouter.get('/users', requireAuth, requireRole('admin'), async (_req: Request, res: Response) => {
  const result = await pool.query(`SELECT u.id, u.username, u.email, u.role, u.created_at, u.revoked_at, COUNT(t.id) FILTER (WHERE t.revoked_at IS NULL) AS active_tokens, MAX(t.last_used) AS last_active FROM users u LEFT JOIN api_tokens t ON t.user_id = u.id GROUP BY u.id ORDER BY u.created_at ASC`)
  res.json({ success: true, users: result.rows })
})

// POST /auth/users/:id/token — generar token para usuario (admin)
authRouter.post('/users/:id/token', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { device_name } = req.body as { device_name?: string }
  const userResult = await pool.query<{ username: string; role: Role; revoked_at: Date | null }>(`SELECT username, role, revoked_at FROM users WHERE id = $1`, [req.params.id])
  if (userResult.rows.length === 0) return void res.status(404).json({ error: 'User not found.' })
  const user = userResult.rows[0]
  if (user.revoked_at) return void res.status(409).json({ error: `User '${user.username}' is revoked.` })
  const token = generateToken(`sk-${user.role}`)
  const devName = device_name ?? `admin-generated-${new Date().toISOString().split('T')[0]}`
  await pool.query(`INSERT INTO api_tokens (token, user_id, device_name) VALUES ($1, $2, $3)`, [token, req.params.id, devName])
  res.json({ success: true, token, device_name: devName, note: `Share with ${user.username}: npx github:tu-org/team-memory install --token <token>` })
})

// PATCH /auth/users/:id/role — cambiar rol (admin)
authRouter.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const { role } = req.body as { role: Role }
  if (!['reader','writer','admin'].includes(role)) return void res.status(400).json({ error: `Invalid role: ${role}` })
  const result = await pool.query<{ username: string }>(`UPDATE users SET role = $1 WHERE id = $2 AND revoked_at IS NULL RETURNING username`, [role, req.params.id])
  if (result.rows.length === 0) return void res.status(404).json({ error: 'User not found or revoked.' })
  res.json({ success: true, message: `Role updated to '${role}' for '${result.rows[0].username}'.` })
})

// DELETE /auth/tokens/:id — revocar token (admin)
authRouter.delete('/tokens/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const result = await pool.query(`UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING device_name`, [req.params.id])
  if (result.rows.length === 0) return void res.status(404).json({ error: 'Token not found or already revoked.' })
  res.json({ success: true, message: `Token for '${result.rows[0].device_name}' revoked.` })
})

// DELETE /auth/users/:id — revocar usuario + tokens (admin)
authRouter.delete('/users/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE api_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [req.params.id])
    const result = await client.query<{ username: string }>(`UPDATE users SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING username`, [req.params.id])
    if (result.rows.length === 0) { await client.query('ROLLBACK'); return void res.status(404).json({ error: 'User not found or already revoked.' }) }
    await client.query('COMMIT')
    res.json({ success: true, message: `User '${result.rows[0].username}' and all tokens revoked.` })
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
})
