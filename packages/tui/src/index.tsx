#!/usr/bin/env tsx
import React           from 'react'
import { render }      from 'ink'
import { App }         from './App.js'
import { checkHealth } from './client.js'
import { resolveServerUrl, resolveProjectSlug, parseArgs } from './config.js'

const c = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  green:'\x1b[32m', red:'\x1b[31m', cyan:'\x1b[36m',
  gray:'\x1b[90m',
}

function parseToken(): string | null {
  const args = process.argv.slice(2)
  const eq   = args.find((a: string) => a.startsWith('--token='))
  if (eq) return eq.slice(8)
  const i = args.indexOf('--token')
  return i >= 0 ? (args[i + 1] ?? null) : null
}

async function getAuthToken(serverUrl: string, explicitToken: string | null): Promise<{
  token:   string | null
  isAdmin: boolean
}> {
  const healthUrl = serverUrl.replace(/\/mcp\/?$/, '/health')
  try {
    const res  = await fetch(healthUrl)
    const data = await res.json() as { auth?: string }
    if (data.auth !== 'enabled') return { token: null, isAdmin: false }
  } catch {
    return { token: null, isAdmin: false }
  }

  const token = explicitToken ?? process.env.TEAM_MEMORY_TOKEN ?? null

  if (!token) {
    console.error(`\n${c.red}✗${c.reset} El servidor requiere autenticación.\n`)
    console.error(`  memory-tui ${c.cyan}--token sk-writer-abc123${c.reset}`)
    console.error(`  ${c.cyan}TEAM_MEMORY_TOKEN${c.reset}=sk-writer-abc123 memory-tui\n`)
    process.exit(1)
  }

  try {
    const meUrl = serverUrl.replace(/\/mcp\/?$/, '/auth/me')
    const res   = await fetch(meUrl, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) {
      console.error(`\n${c.red}✗${c.reset} Token inválido o revocado.\n`)
      process.exit(1)
    }
    const data = await res.json() as { user: { role: string; username: string } }
    console.log(`  ${c.green}✓${c.reset} Usuario    ${c.bold}${data.user.username}${c.reset}  ${c.gray}(${data.user.role})${c.reset}`)
    return { token, isAdmin: data.user.role === 'admin' }
  } catch (e) {
    console.error(`\n${c.red}✗${c.reset} Error verificando token: ${(e as Error).message}\n`)
    process.exit(1)
  }
}

async function main() {
  const args          = parseArgs()
  const explicitToken = parseToken()

  console.log(`\n${c.bold}${c.cyan}team-memory TUI${c.reset}  ${c.gray}v4${c.reset}\n`)

  // ── URL ───────────────────────────────────────────────────────────────────
  const serverUrl = resolveServerUrl(args.url)
  if (!serverUrl) {
    console.error(`${c.red}✗${c.reset} No se encontró la URL del servidor.\n`)
    console.error(`  memory-tui ${c.cyan}--url=http://IP:3100/mcp${c.reset}`)
    console.error(`  ${c.cyan}TEAM_MEMORY_URL${c.reset}=http://IP:3100/mcp memory-tui\n`)
    process.exit(1)
  }
  console.log(`  ${c.green}✓${c.reset} Servidor   ${c.bold}${serverUrl}${c.reset}`)

  // ── project_slug ──────────────────────────────────────────────────────────
  const projectSlug = resolveProjectSlug(args.project)
  if (!projectSlug) {
    console.error(`\n${c.red}✗${c.reset} No se encontró el project_slug.\n`)
    console.error(`  memory-tui ${c.cyan}--project=nombre${c.reset}`)
    console.error(`  Agregar ${c.cyan}.team-memory.json${c.reset} al root del repo\n`)
    process.exit(1)
  }
  console.log(`  ${c.green}✓${c.reset} Proyecto   ${c.bold}${projectSlug}${c.reset}`)

  // ── Health check ──────────────────────────────────────────────────────────
  process.stdout.write(`  ${c.dim}  Conectando...${c.reset}`)
  const healthy = await checkHealth(serverUrl)
  process.stdout.write('\r')

  if (!healthy) {
    console.error(`  ${c.red}✗${c.reset} El servidor no responde en ${c.bold}${serverUrl}${c.reset}\n`)
    process.exit(1)
  }
  console.log(`  ${c.green}✓${c.reset} Conectado  ${c.gray}${serverUrl.replace(/\/mcp\/?$/, '/health')}${c.reset}`)

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { token: apiToken, isAdmin } = await getAuthToken(serverUrl, explicitToken)
  if (isAdmin) {
    console.log(`  ${c.green}✓${c.reset} Modo admin ${c.gray}(acceso completo)${c.reset}`)
  }
  console.log()

  render(
    <App url={serverUrl} project={projectSlug} apiToken={apiToken} isAdmin={isAdmin} />,
    { exitOnCtrlC: true }
  )
}

main().catch(e => {
  console.error(`\n${c.red}✗${c.reset} Error: ${(e as Error).message}\n`)
  process.exit(1)
})
