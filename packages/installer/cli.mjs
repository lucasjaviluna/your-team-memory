#!/usr/bin/env node
/**
 * cli.mjs — Entry point del comando `team-memory` (campo "bin" del package.json raíz)
 *
 * Traduce subcomandos (install / uninstall / help) a los flags que ya entiende
 * install.mjs, y lo ejecuta como proceso hijo. No duplica lógica — install.mjs
 * sigue siendo la única fuente de verdad, ya probada de forma standalone.
 *
 * Uso final (vía npx, sin clonar el repo):
 *   npx github:tu-org/team-memory install --url http://IP-SERVIDOR:3100/mcp
 *   npx github:tu-org/team-memory uninstall
 *   npx github:tu-org/team-memory help
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const installScript = join(__dirname, 'install.mjs')

const [subcommand, ...rest] = process.argv.slice(2)

function printHelp() {
  console.log(`
${'\x1b[1m'}team-memory${'\x1b[0m'} — instalador universal del sistema de memoria compartida del equipo

${'\x1b[1m'}Uso:${'\x1b[0m'}
  team-memory install [opciones]   Registra el MCP globalmente en las herramientas
                                   de IA detectadas e instala el protocolo de uso.
  team-memory uninstall            Revierte todo lo instalado
  team-memory help                 Muestra esta ayuda

${'\x1b[1m'}Transporte (--transport):${'\x1b[0m'}
  --transport=http   (default) Servidor remoto via Streamable HTTP
  --transport=stdio            Servidor local como subproceso del cliente IA

${'\x1b[1m'}Opciones para --transport=http:${'\x1b[0m'}
  --url <url>        URL del servidor (override de config/env)

${'\x1b[1m'}Opciones para --transport=stdio:${'\x1b[0m'}
  --server-path <ruta>   Ruta al dist/index.js del servidor compilado

${'\x1b[1m'}Resolución de URL para http (en orden):${'\x1b[0m'}
  1. --url <url>                     Flag explícito
  2. team-memory.config.json         Campo "defaultUrl"
  3. TEAM_MEMORY_URL                 Variable de entorno

${'\x1b[1m'}Flags comunes:${'\x1b[0m'}
  --dry-run          Muestra qué se haría sin escribir nada
  --yes              Sin confirmaciones (para scripts de onboarding)
  --only=<lista>     Limita a herramientas: claude,vscode,copilot-cli,cursor

${'\x1b[1m'}Flags comunes:${'\x1b[0m'}
  --dry-run            Muestra qué se haría, sin escribir nada
  --yes                No pregunta confirmación (para scripts de onboarding)
  --only=<lista>        Limita a herramientas específicas: claude,vscode,copilot-cli,cursor

${'\x1b[1m'}Ejemplos:${'\x1b[0m'}
  # HTTP (servidor remoto — modo default)
  npx github:tu-org/team-memory install
  npx github:tu-org/team-memory install --url http://10.0.0.5:3100/mcp
  TEAM_MEMORY_URL=http://10.0.0.5:3100/mcp npx github:tu-org/team-memory install

  # stdio (servidor local — desarrollo)
  npx github:tu-org/team-memory install --transport=stdio
  npx github:tu-org/team-memory install --transport=stdio --server-path=/ruta/packages/server/dist/index.js

  # Otros
  npx github:tu-org/team-memory install --dry-run
  npx github:tu-org/team-memory uninstall --only=cursor
`)
}

if (subcommand === undefined) {
  printHelp()
  process.exit(0)
}

let forwardedArgs
if (subcommand === 'install') {
  forwardedArgs = rest
} else if (subcommand === 'uninstall') {
  forwardedArgs = ['--uninstall', ...rest]
} else if (['help', '--help', '-h'].includes(subcommand)) {
  printHelp()
  process.exit(0)
} else {
  console.error(`Subcomando desconocido: "${subcommand}"`)
  printHelp()
  process.exit(1)
}

const result = spawnSync(process.execPath, [installScript, ...forwardedArgs], { stdio: 'inherit' })
process.exit(result.status ?? 1)
