import { readFileSync, existsSync } from 'fs'
import { join, dirname }            from 'path'
import { homedir }                  from 'os'
import { fileURLToPath }            from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface TeamMemoryConfig {
  project_slug?: string
  default_area?: string
  area_map?:     Record<string, string>
}

export interface Resolved<T> {
  value:  T
  source: string   // de dónde vino el valor
}

// ── URL del servidor ──────────────────────────────────────────────────────────

export function resolveServerUrl(explicit?: string): Resolved<string> | null {
  if (explicit)
    return { value: explicit, source: '--url' }

  if (process.env.TEAM_MEMORY_URL)
    return { value: process.env.TEAM_MEMORY_URL, source: 'TEAM_MEMORY_URL' }

  const configPaths = [
    join(__dirname, '..', '..', 'installer', 'team-memory.config.json'),
    join(homedir(), '.config', 'team-memory', 'config.json'),
  ]
  for (const p of configPaths) {
    if (existsSync(p)) {
      try {
        const c = JSON.parse(readFileSync(p, 'utf-8'))
        if (c.defaultUrl) return { value: c.defaultUrl, source: 'team-memory.config.json' }
      } catch { /**/ }
    }
  }

  return null
}

// ── project_slug ──────────────────────────────────────────────────────────────

export function findTeamMemoryJsonPath(): string | null {
  let dir = process.cwd()
  while (true) {
    const f = join(dir, '.team-memory.json')
    if (existsSync(f)) return f
    if (existsSync(join(dir, '.git'))) return null
    const p = dirname(dir); if (p === dir) return null; dir = p
  }
}

export function readTeamMemoryConfig(): TeamMemoryConfig {
  const path = findTeamMemoryJsonPath()
  if (!path) return {}
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return {} }
}

export function resolveProjectSlug(explicit?: string): Resolved<string> | null {
  if (explicit)
    return { value: explicit, source: '--project' }

  const path = findTeamMemoryJsonPath()
  if (path) {
    try {
      const cfg = JSON.parse(readFileSync(path, 'utf-8')) as TeamMemoryConfig
      if (cfg.project_slug)
        return { value: cfg.project_slug, source: '.team-memory.json' }
    } catch { /**/ }
  }

  return null
}

// ── CLI args ──────────────────────────────────────────────────────────────────

export function parseArgs(): { url?: string; project?: string } {
  const args = process.argv.slice(2)
  const get  = (flag: string) => {
    const eq = args.find(a => a.startsWith(`${flag}=`))
    if (eq) return eq.slice(flag.length + 1)
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return { url: get('--url'), project: get('--project') }
}
