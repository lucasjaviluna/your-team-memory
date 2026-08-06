#!/usr/bin/env tsx
import React           from 'react'
import { render }      from 'ink'
import { App }         from './App.js'
import { checkHealth } from './client.js'
import { resolveServerUrl, resolveProjectSlug, parseArgs } from './config.js'

const c = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  green:'\x1b[32m', red:'\x1b[31m', cyan:'\x1b[36m',
  gray:'\x1b[90m',  yellow:'\x1b[33m', blue:'\x1b[34m',
}

function source(s: string): string {
  return `${c.gray}← ${s}${c.reset}`
}

async function main() {
  const { url: urlArg, project: projArg } = parseArgs()

  // ── Cabecera ────────────────────────────────────────────────────────────────
  console.log(`\n${c.bold}${c.cyan}team-memory TUI${c.reset}  ${c.gray}v4${c.reset}\n`)

  // ── Resolver URL ─────────────────────────────────────────────────────────────
  const urlResolved = resolveServerUrl(urlArg)
  if (!urlResolved) {
    console.error(`${c.red}✗${c.reset} No se encontró la URL del servidor.\n`)
    console.error(`  ${c.bold}Opciones:${c.reset}`)
    console.error(`    memory-tui ${c.cyan}--url=http://IP:3100/mcp${c.reset}`)
    console.error(`    ${c.cyan}TEAM_MEMORY_URL${c.reset}=http://IP:3100/mcp memory-tui`)
    console.error(`    Configurar ${c.cyan}defaultUrl${c.reset} en team-memory.config.json\n`)
    process.exit(1)
  }
  console.log(`  ${c.green}✓${c.reset} Servidor   ${c.bold}${urlResolved.value}${c.reset}  ${source(urlResolved.source)}`)

  // ── Resolver project_slug ────────────────────────────────────────────────────
  const projectResolved = resolveProjectSlug(projArg)
  if (!projectResolved) {
    console.error(`\n${c.red}✗${c.reset} No se encontró el project_slug.\n`)
    console.error(`  ${c.bold}Opciones:${c.reset}`)
    console.error(`    memory-tui ${c.cyan}--project=nombre-del-proyecto${c.reset}`)
    console.error(`    Agregar ${c.cyan}.team-memory.json${c.reset} al root del repo con { "project_slug": "..." }\n`)
    process.exit(1)
  }
  console.log(`  ${c.green}✓${c.reset} Proyecto   ${c.bold}${projectResolved.value}${c.reset}  ${source(projectResolved.source)}`)

  // ── Health check ─────────────────────────────────────────────────────────────
  process.stdout.write(`  ${c.dim}  Conectando...${c.reset}`)
  const healthy = await checkHealth(urlResolved.value)
  process.stdout.write('\r')   // limpiar la línea de "Conectando..."

  if (!healthy) {
    console.error(`  ${c.red}✗${c.reset} El servidor no responde en ${c.bold}${urlResolved.value}${c.reset}\n`)
    console.error(`    Verificá que el servidor esté corriendo y que estés en la VPN.\n`)
    process.exit(1)
  }
  console.log(`  ${c.green}✓${c.reset} Conectado  ${c.gray}${urlResolved.value.replace(/\/mcp\/?$/, '/health')}${c.reset}`)
  console.log()

  // ── Render ───────────────────────────────────────────────────────────────────
  render(
    <App url={urlResolved.value} project={projectResolved.value} />,
    { exitOnCtrlC: true }
  )
}

main().catch(e => {
  console.error(`\n${c.red}✗${c.reset} Error inesperado: ${(e as Error).message}\n`)
  process.exit(1)
})
