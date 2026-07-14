#!/usr/bin/env node
/**
 * install.mjs — Instalador universal de team-memory
 *
 * Detecta qué herramientas de IA están instaladas (Claude Code, Copilot CLI,
 * VS Code/Copilot, Cursor) y registra el servidor MCP team-memory de forma
 * GLOBAL en cada una, además de instalar el protocolo de uso (instrucciones
 * siempre-activas + skill detallado) — todo de forma idempotente y segura.
 *
 * Uso:
 *   node install.mjs                                        (usa defaultUrl de config o TEAM_MEMORY_URL)
 *   node install.mjs --url http://IP-SERVIDOR:3100/mcp      (override explícito)
 *   TEAM_MEMORY_URL=http://IP:3100/mcp node install.mjs     (variable de entorno)
 *   node install.mjs --dry-run
 *   node install.mjs --yes
 *   node install.mjs --uninstall
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HOME = homedir()
const SERVER_NAME = 'team-memory'

// ── Argumentos ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function getArg(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}
const URL_ARG       = getArg('--url')
const DRY_RUN       = args.includes('--dry-run')
const ASSUME_YES    = args.includes('--yes')
const UNINSTALL     = args.includes('--uninstall')
const ONLY          = getArg('--only')
const TRANSPORT_ARG = (args.find(a => a.startsWith('--transport='))?.split('=')[1]) ?? 'http'
const IS_STDIO      = TRANSPORT_ARG === 'stdio'

if (!['http', 'stdio'].includes(TRANSPORT_ARG)) {
  console.error(`Transporte desconocido: "${TRANSPORT_ARG}". Valores válidos: http, stdio`)
  process.exit(1)
}

// ── Resolución de URL: --url > team-memory.config.json > TEAM_MEMORY_URL > error ────

function resolveServerUrl() {
  // 1. Flag explícito — siempre tiene prioridad
  if (URL_ARG) return { url: URL_ARG, source: '--url' }

  // 2. Config del repo (defaultUrl) — URL específica de la organización
  const configPath = join(__dirname, 'team-memory.config.json')
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (config.defaultUrl) {
        return { url: config.defaultUrl, source: 'team-memory.config.json' }
      }
    } catch {
      warn(`No se pudo leer ${configPath} — ignorando defaultUrl.`)
    }
  }

  // 3. Variable de entorno TEAM_MEMORY_URL
  //    Útil cuando el instalador se distribuye vía npm (sin config del repo)
  //    o en scripts de onboarding automatizado (CI, Ansible, Dockerfile)
  if (process.env.TEAM_MEMORY_URL) {
    return { url: process.env.TEAM_MEMORY_URL, source: 'TEAM_MEMORY_URL' }
  }

  return { url: null, source: null }
}

// ── Output helpers ────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
}
const ok    = (m) => console.log(`${c.green}✓${c.reset} ${m}`)
const skip  = (m) => console.log(`${c.gray}–${c.reset} ${m}`)
const warn  = (m) => console.log(`${c.yellow}⚠${c.reset} ${m}`)
const err   = (m) => console.log(`${c.red}✗${c.reset} ${m}`)
const head  = (m) => console.log(`\n${c.bold}${c.cyan}${m}${c.reset}`)
const info  = (m) => console.log(`${c.gray}  ${m}${c.reset}`)

async function confirm(question) {
  if (ASSUME_YES) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((res) => rl.question(`${question} [y/N] `, res))
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

// ── Detección de herramientas instaladas ──────────────────────────────────────

function commandExists(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function detectTools() {
  const filter = ONLY ? ONLY.split(',') : null
  const want = (name) => !filter || filter.includes(name)

  return {
    claude:     want('claude')      && commandExists('claude'),
    vscode:     want('vscode')      && commandExists('code'),
    copilotCli: want('copilot-cli') && (commandExists('copilot') || existsSync(join(HOME, '.copilot'))),
    cursor:     want('cursor')      && existsSync(join(HOME, '.cursor')),
  }
}

// ── Backup ────────────────────────────────────────────────────────────────────

function backupFile(path) {
  if (!existsSync(path)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${path}.bak-${stamp}`
  copyFileSync(path, backupPath)
  return backupPath
}

// ── Detección de conflictos semánticos ────────────────────────────────────────

const CONFLICT_PATTERNS = [
  { re: /nunca\s+(uses?|llames?)\s+(herramientas?|tools?|mcp)/i, msg: 'Hay una instrucción que parece prohibir el uso de herramientas/MCP en general.' },
  { re: /siempre\s+ped[íi]\s+confirmaci[oó]n\s+antes\s+de\s+(buscar|usar)/i, msg: 'Hay una instrucción que exige confirmación antes de cada búsqueda/uso de herramientas — puede chocar con "buscar antes de responder" del protocolo.' },
  { re: /no\s+(persistas?|guard[eé]s?)\s+nada/i, msg: 'Hay una instrucción que prohíbe persistir información — revisar si aplica también a team-memory.' },
  { re: /never\s+(use|call)\s+(tools?|mcp)/i, msg: 'Found an instruction that appears to forbid using tools/MCP in general.' },
]

function scanForConflicts(content) {
  return CONFLICT_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.msg)
}

// ── Inserción idempotente por marcadores ──────────────────────────────────────

const MARK_START = `<!-- ${SERVER_NAME}:start -->`
const MARK_END   = `<!-- ${SERVER_NAME}:end -->`

function buildBlock(innerContent) {
  return `${MARK_START}\n${innerContent.trim()}\n${MARK_END}`
}

/**
 * Inserta o reemplaza el bloque marcado en un archivo de instrucciones.
 * Nunca toca contenido fuera de los marcadores. Hace backup antes de escribir.
 * Retorna { action, diffPreview, warnings, backupPath }
 */
function upsertMarkerBlock(filePath, innerContent) {
  const block = buildBlock(innerContent)
  const exists = existsSync(filePath)
  const existingContent = exists ? readFileSync(filePath, 'utf-8') : ''

  const hasMarkers = existingContent.includes(MARK_START) && existingContent.includes(MARK_END)
  const warnings = exists ? scanForConflicts(existingContent) : []

  let newContent
  let action

  if (!exists) {
    newContent = block + '\n'
    action = 'created'
  } else if (hasMarkers) {
    const re = new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`)
    newContent = existingContent.replace(re, block)
    action = newContent === existingContent ? 'unchanged' : 'replaced'
  } else {
    const sep = existingContent.endsWith('\n') ? '\n' : '\n\n'
    newContent = existingContent + sep + block + '\n'
    action = 'appended'
  }

  if (DRY_RUN) {
    return { action: `${action} (dry-run, no se escribió nada)`, warnings, backupPath: null }
  }

  let backupPath = null
  if (exists && action !== 'unchanged') {
    backupPath = backupFile(filePath)
  }

  if (action !== 'unchanged') {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, newContent, 'utf-8')
  }

  return { action, warnings, backupPath }
}

function removeMarkerBlock(filePath) {
  if (!existsSync(filePath)) return { action: 'not-found' }
  const content = readFileSync(filePath, 'utf-8')
  if (!content.includes(MARK_START)) return { action: 'no-block' }

  if (DRY_RUN) return { action: 'would-remove (dry-run)' }

  const backupPath = backupFile(filePath)
  const re = new RegExp(`\\n?${MARK_START}[\\s\\S]*?${MARK_END}\\n?`)
  const newContent = content.replace(re, '\n')
  writeFileSync(filePath, newContent, 'utf-8')
  return { action: 'removed', backupPath }
}

// ── Skills (archivo completo, no se mergea — overwrite directo) ─────────────

function writeSkillFile(skillDir, content) {
  if (DRY_RUN) return { action: 'would-write (dry-run)' }
  mkdirSync(skillDir, { recursive: true })
  const path = join(skillDir, 'SKILL.md')
  const existed = existsSync(path)
  writeFileSync(path, content, 'utf-8')
  return { action: existed ? 'updated' : 'created', path }
}

function removeSkillFile(skillDir) {
  const path = join(skillDir, 'SKILL.md')
  if (!existsSync(path)) return { action: 'not-found' }
  if (DRY_RUN) return { action: 'would-remove (dry-run)' }
  backupFile(path)
  writeFileSync(path, '', 'utf-8') // dejar vacío en vez de borrar — menos destructivo
  return { action: 'cleared' }
}

// ── Registro de MCP server por herramienta ───────────────────────────────────

function registerClaudeMcp(url) {
  try {
    execFileSync('claude', ['mcp', 'remove', SERVER_NAME, '-s', 'user'], { stdio: 'ignore' })
  } catch { /* no existía, está bien */ }
  if (DRY_RUN) return { action: `would run: claude mcp add --transport http --scope user ${SERVER_NAME} ${url}` }
  execFileSync('claude', ['mcp', 'add', '--transport', 'http', '--scope', 'user', SERVER_NAME, url], { stdio: 'pipe' })
  return { action: 'registered' }
}

function registerVscodeMcp(url) {
  const payload = JSON.stringify({ name: SERVER_NAME, type: 'http', url })
  if (DRY_RUN) return { action: `would run: code --add-mcp '${payload}'` }
  execFileSync('code', ['--add-mcp', payload], { stdio: 'pipe' })
  return { action: 'registered' }
}

/** Merge directo de JSON para herramientas sin comando CLI de alta (Cursor, Copilot CLI) */
function mergeJsonMcpConfig(configPath, url) {
  let config = { mcpServers: {} }
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (!config.mcpServers) config.mcpServers = {}
    } catch {
      warn(`No se pudo parsear ${configPath} como JSON — se omite para no corromperlo.`)
      return { action: 'parse-error' }
    }
  }

  const already = config.mcpServers[SERVER_NAME]
  config.mcpServers[SERVER_NAME] = { type: 'http', url }

  if (DRY_RUN) return { action: already ? 'would-update (dry-run)' : 'would-add (dry-run)' }

  if (existsSync(configPath)) backupFile(configPath)
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  return { action: already ? 'updated' : 'added' }
}

function unregisterClaudeMcp() {
  if (DRY_RUN) return { action: 'would run: claude mcp remove team-memory -s user' }
  try {
    execFileSync('claude', ['mcp', 'remove', SERVER_NAME, '-s', 'user'], { stdio: 'pipe' })
    return { action: 'removed' }
  } catch {
    return { action: 'not-found' }
  }
}

function unregisterFromJsonConfig(configPath) {
  if (!existsSync(configPath)) return { action: 'not-found' }
  if (DRY_RUN) return { action: 'would-remove (dry-run)' }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (config.mcpServers?.[SERVER_NAME]) {
      backupFile(configPath)
      delete config.mcpServers[SERVER_NAME]
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
      return { action: 'removed' }
    }
    return { action: 'not-registered' }
  } catch {
    return { action: 'parse-error' }
  }
}

// ── Validación de conectividad ────────────────────────────────────────────────

async function checkServerHealth(mcpUrl) {
  try {
    const healthUrl = mcpUrl.replace(/\/mcp\/?$/, '/health')
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

// ── Protocolo (contenido) ─────────────────────────────────────────────────────

const protocolShort = readFileSync(join(__dirname, 'protocol-short.md'), 'utf-8')
const protocolSkill = readFileSync(join(__dirname, 'protocol-skill.md'), 'utf-8')

// ── Instaladores por herramienta ──────────────────────────────────────────────

async function installClaude(url) {
  head('Claude Code')

  const mcp = registerClaudeMcp(url)
  ok(`MCP server (scope: user/global) → ${mcp.action}`)

  const claudeMdPath = join(HOME, '.claude', 'CLAUDE.md')
  const res = upsertMarkerBlock(claudeMdPath, protocolShort)
  reportFileResult('CLAUDE.md (instrucciones siempre activas)', claudeMdPath, res)

  const skillRes = writeSkillFile(join(HOME, '.claude', 'skills', SERVER_NAME), protocolSkill)
  ok(`Skill ${SERVER_NAME} → ${skillRes.action}`)
}

async function installVscode(url) {
  head('VS Code (GitHub Copilot)')

  const mcp = registerVscodeMcp(url)
  ok(`MCP server (perfil global) → ${mcp.action}`)

  // VS Code Copilot Chat no tiene un archivo global de instrucciones editable
  // de forma confiable — se usa el skill compartido de Copilot (~/.copilot/skills)
  // que es portable entre VS Code, Copilot CLI y el coding agent.
  skip('Instrucciones siempre-activas: usa el skill global de Copilot (instalado abajo)')
}

async function installCopilotCli(url) {
  head('GitHub Copilot CLI')

  const mcpConfigPath = join(HOME, '.copilot', 'mcp-config.json')
  const mcp = mergeJsonMcpConfig(mcpConfigPath, url)
  ok(`MCP server (~/.copilot/mcp-config.json) → ${mcp.action}`)

  const instructionsPath = join(HOME, '.copilot', 'copilot-instructions.md')
  const res = upsertMarkerBlock(instructionsPath, protocolShort)
  reportFileResult('copilot-instructions.md (global)', instructionsPath, res)

  const skillRes = writeSkillFile(join(HOME, '.copilot', 'skills', SERVER_NAME), protocolSkill)
  ok(`Skill ${SERVER_NAME} (~/.copilot/skills, portable a VS Code) → ${skillRes.action}`)
}

async function installCursor(url) {
  head('Cursor')

  const mcpConfigPath = join(HOME, '.cursor', 'mcp.json')
  const mcp = mergeJsonMcpConfig(mcpConfigPath, url)
  ok(`MCP server (~/.cursor/mcp.json, global) → ${mcp.action}`)

  warn('Cursor no permite escribir las "User Rules" globales desde archivo — paso manual requerido:')
  info('1. Abrí Cursor → Settings → Rules')
  info('2. Pegá esto en "User Rules":')
  console.log(`${c.dim}${'-'.repeat(60)}${c.reset}`)
  console.log(protocolShort.split('\n').slice(0, 8).join('\n') + '\n  ...')
  console.log(`${c.dim}${'-'.repeat(60)}${c.reset}`)
  info(`Protocolo completo disponible en: ${join(__dirname, 'protocol-skill.md')}`)
}

function reportFileResult(label, path, res) {
  if (res.action === 'unchanged') {
    skip(`${label} → sin cambios (ya estaba actualizado)`)
  } else {
    ok(`${label} → ${res.action}${res.backupPath ? ` (backup: ${res.backupPath})` : ''}`)
  }
  for (const w of res.warnings ?? []) {
    warn(`  Posible tensión detectada en ${path}: ${w}`)
  }
}

// ── Desinstalación ────────────────────────────────────────────────────────────

async function uninstallAll(tools) {
  head('Desinstalando team-memory')

  if (tools.claude) {
    const r = unregisterClaudeMcp()
    ok(`Claude Code MCP → ${r.action}`)
    const fileRes = removeMarkerBlock(join(HOME, '.claude', 'CLAUDE.md'))
    ok(`CLAUDE.md → ${fileRes.action}`)
    removeSkillFile(join(HOME, '.claude', 'skills', SERVER_NAME))
  }

  if (tools.vscode) {
    // code --remove-mcp no existe de forma confiable en todas las versiones;
    // se deja indicado para remoción manual vía MCP: List Servers
    info('VS Code: remové el servidor manualmente con "MCP: List Servers" → Remove (no hay flag CLI estable de remoción)')
  }

  if (tools.copilotCli) {
    const r = unregisterFromJsonConfig(join(HOME, '.copilot', 'mcp-config.json'))
    ok(`Copilot CLI MCP → ${r.action}`)
    const fileRes = removeMarkerBlock(join(HOME, '.copilot', 'copilot-instructions.md'))
    ok(`copilot-instructions.md → ${fileRes.action}`)
    removeSkillFile(join(HOME, '.copilot', 'skills', SERVER_NAME))
  }

  if (tools.cursor) {
    const r = unregisterFromJsonConfig(join(HOME, '.cursor', 'mcp.json'))
    ok(`Cursor MCP → ${r.action}`)
    warn('Cursor: remové manualmente el bloque de team-memory de Settings → Rules → User Rules')
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}╔══════════════════════════════════════════╗${c.reset}`)
  console.log(`${c.bold}║   team-memory — Universal Installer      ║${c.reset}`)
  console.log(`${c.bold}╚══════════════════════════════════════════╝${c.reset}`)
  if (DRY_RUN) console.log(`${c.yellow}Modo dry-run — no se escribirá ningún archivo${c.reset}`)

  const tools = detectTools()
  const detected = Object.entries(tools).filter(([, v]) => v).map(([k]) => k)

  if (detected.length === 0) {
    err('No se detectó ninguna herramienta soportada (Claude Code, VS Code, Copilot CLI, Cursor).')
    process.exit(1)
  }

  console.log(`\nDetectado: ${detected.join(', ')}`)

  if (UNINSTALL) {
    const proceed = await confirm('\n¿Confirmás la desinstalación de team-memory en las herramientas detectadas?')
    if (!proceed) { console.log('Cancelado.'); return }
    await uninstallAll(tools)
    console.log(`\n${c.green}Desinstalación completa.${c.reset}`)
    return
  }

  if (IS_STDIO) {
    console.log('')
    warn('Estás usando --transport=stdio.')
    warn('Este modo está pensado para quien administra el servidor team-memory,')
    warn('no para devs del equipo que consumen la memoria compartida.')
    warn('En modo stdio el cliente necesita las credenciales del servidor (DB, Ollama).')
    warn('Para uso en equipo usá el modo http (default) — las credenciales')
    warn('quedan en el servidor y el dev solo necesita la URL.')
    console.log('')
    const proceed = await confirm('¿Confirmás que querés continuar con stdio?')
    if (!proceed) {
      console.log(`\nAlternativa: npx github:tu-org/team-memory install --url http://IP:3100/mcp`)
      return
    }
  }

  const { url: SERVER_URL, source: urlSource } = resolveServerUrl()

  if (!SERVER_URL) {
    err('No se encontró la URL del servidor. Tres formas de proveerla:')
    info('1. Flag explícito:      npx github:tu-org/team-memory install --url http://IP:3100/mcp')
    info('2. Config del repo:     editar scripts/install/team-memory.config.json → "defaultUrl"')
    info('3. Variable de entorno: TEAM_MEMORY_URL=http://IP:3100/mcp npx github:tu-org/team-memory install')
    process.exit(1)
  }
  if (urlSource === 'team-memory.config.json') {
    info(`Usando URL por defecto del repo (${urlSource}): ${SERVER_URL}`)
  }
  if (urlSource === 'TEAM_MEMORY_URL') {
    info(`Usando URL de variable de entorno (TEAM_MEMORY_URL): ${SERVER_URL}`)
  }

  head('Verificando conectividad con el servidor')
  const healthy = await checkServerHealth(SERVER_URL)
  if (healthy) {
    ok(`Servidor respondiendo en ${SERVER_URL}`)
  } else {
    warn(`No se pudo verificar /health en ${SERVER_URL} — ¿estás conectado a la VPN/red interna?`)
    const proceed = await confirm('¿Continuar igual con la instalación?')
    if (!proceed) { console.log('Cancelado.'); return }
  }

  if (!DRY_RUN) {
    const proceed = await confirm(
      `\nSe va a registrar el MCP "${SERVER_NAME}" (${SERVER_URL}) y modificar archivos de configuración global ` +
      `(con backup automático) en: ${detected.join(', ')}. ¿Continuar?`
    )
    if (!proceed) { console.log('Cancelado.'); return }
  }

  if (tools.claude)     await installClaude(SERVER_URL)
  if (tools.vscode)     await installVscode(SERVER_URL)
  if (tools.copilotCli) await installCopilotCli(SERVER_URL)
  if (tools.cursor)     await installCursor(SERVER_URL)

  console.log(`\n${c.bold}${c.green}✅ Instalación completa${c.reset}`)
  console.log(`${c.gray}Iniciá una nueva sesión en cualquiera de las herramientas detectadas para que tome efecto.${c.reset}`)
  if (DRY_RUN) console.log(`${c.yellow}Esto fue un dry-run — corré sin --dry-run para aplicar los cambios.${c.reset}`)
}

main().catch((e) => {
  err(`Error fatal: ${e.message}`)
  process.exit(1)
})
