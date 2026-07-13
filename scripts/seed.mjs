/**
 * seed.mjs — Genera datos de prueba realistas para el sistema team-memory
 *
 * Genera 100 entradas por tipo (900 total) con:
 *  - Contenido variado por área y tipo
 *  - Timestamps distribuidos en 3 franjas (reciente / media / antigua)
 *  - access_count simulado (reciente=moderado, antigua=bajo+alguna protegida)
 *  - Varios autores para probar get_memory_stats por author
 *  - Un par de entradas con título casi idéntico para probar deduplicación
 *
 * Uso:
 *   node --env-file=.env scripts/seed.mjs              → con embeddings (~15 min)
 *   node --env-file=.env scripts/seed.mjs --quick      → sin embeddings (~30 seg)
 *   node --env-file=.env scripts/seed.mjs --clean      → borra datos previos primero
 *   node --env-file=.env scripts/seed.mjs --quick --clean
 */

import pg from 'pg'
const { Pool } = pg

const QUICK   = process.argv.includes('--quick')
const CLEAN   = process.argv.includes('--clean')
const PROJECT = 'ecommerce-platform'
const PER_TYPE = 100

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
})

async function embed(text) {
  if (QUICK) return null
  try {
    const res = await fetch(`${process.env.OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text', prompt: text }),
    })
    const data = await res.json()
    return data.embedding
  } catch { return null }
}

// ── Distribución de tiempo y accesos ─────────────────────────────────────────

function getTimestamp(i) {
  if (i < 30)  return randomDate(0, 30)   // reciente
  if (i < 60)  return randomDate(31, 90)  // media
  return              randomDate(91, 365) // antigua
}

function randomDate(minD, maxD) {
  const ms = (minD + Math.random() * (maxD - minD)) * 86400000
  return new Date(Date.now() - ms).toISOString()
}

function getAccessCount(i) {
  if (i < 30)  return Math.floor(Math.random() * 10) + 2
  if (i < 60)  return Math.floor(Math.random() * 8)
  if (i % 10 === 0) return Math.floor(Math.random() * 30) + 10 // protegida
  return Math.floor(Math.random() * 4)
}

function getLastAccessed(i, createdAt) {
  if (i < 30)  return new Date(Date.now() - Math.random() * 15 * 86400000).toISOString()
  if (i < 60)  return new Date(Date.now() - (10 + Math.random() * 30) * 86400000).toISOString()
  if (i % 10 === 0) return new Date(Date.now() - Math.random() * 20 * 86400000).toISOString()
  return Math.random() < 0.4 ? null : new Date(Date.now() - (60 + Math.random() * 200) * 86400000).toISOString()
}

const AUTHORS = ['lucas', 'sofia', 'martin', 'ana', 'diego', 'carla']
const AREAS   = ['frontend', 'backend', 'infra', 'general']
const pick    = arr => arr[Math.floor(Math.random() * arr.length)]
const rAuthor = ()  => pick(AUTHORS)
const rArea   = ()  => pick(AREAS)

// ── Generadores de contenido ──────────────────────────────────────────────────

const TOPICS = {
  frontend: ['React component lifecycle', 'Zustand state management', 'lazy loading with Suspense', 'CSS-in-JS with styled-components', 'form validation with React Hook Form', 'infinite scroll implementation', 'image optimization', 'dark mode with CSS variables', 'accessibility in modals', 'bundle size optimization'],
  backend:  ['JWT authentication flow', 'Stripe payment webhooks', 'order fulfillment pipeline', 'PostgreSQL query optimization', 'Redis caching strategy', 'rate limiting middleware', 'email queue with BullMQ', 'REST API versioning', 'file upload with S3', 'database connection pooling'],
  infra:    ['Docker multi-stage builds', 'GitHub Actions CI/CD', 'nginx reverse proxy', 'PostgreSQL backup strategy', 'environment variables management', 'SSL certificate renewal', 'container health checks', 'log aggregation with Loki', 'blue-green deployments', 'Kubernetes resource limits'],
  general:  ['Git branching strategy', 'code review process', 'sprint planning', 'API contract first design', 'error monitoring with Sentry', 'feature flags strategy', 'technical debt tracking', 'onboarding new devs', 'documentation standards', 'incident response playbook'],
}

function topic(area, i) { return TOPICS[area][i % TOPICS[area].length] }

const generators = {
  BUG: (i, area) => ({
    title: `BUG-${String(i+1).padStart(3,'0')}: ${topic(area,i)} failure`,
    content: `**Severity:** ${pick(['critical','high','medium','low'])}\n**Environment:** ${pick(['production','staging'])}\n\n**Symptoms:**\n${topic(area,i)} started failing after the last deploy. Users reported ${pick(['timeout errors','blank screens','500 responses'])} when attempting to ${pick(['checkout','log in','load products'])}.\n\n**Root cause:**\n${pick(['Race condition in async state update','Missing null check on API response','Stale connection in pool','Incorrect env variable in production'])}\n\n**Workaround:** ${pick(['Restart the service','Clear cache','Rollback to previous version'])}`,
    tags: [area, topic(area,i).split(' ')[0].toLowerCase(), 'bug'],
  }),

  FIX: (i, area) => ({
    title: `FIX: ${topic(area,i)} — ${pick(['resolved memory leak','fixed race condition','corrected config'])}`,
    content: `**Problem:** ${topic(area,i)} was causing ${pick(['high CPU usage','memory growth','slow responses'])}.\n\n**Solution applied:**\n${pick(['Added cleanup function in useEffect to cancel pending requests on unmount.','Moved async operation outside render cycle using useCallback.','Added connection timeout and retry logic with exponential backoff.','Implemented request deduplication using a Map keyed by request signature.'])}\n\n**Tested in:** ${pick(['staging for 48h','unit tests + integration tests','load test with k6'])}\n**Author:** ${rAuthor()}`,
    tags: [area, topic(area,i).split(' ')[0].toLowerCase(), 'fix', 'resolved'],
  }),

  DECISION: (i, area) => {
    const chosen = pick(['Zustand','React Query','Hono','Drizzle','Resend','BullMQ'])
    const rejected = pick(['Redux','SWR','Express','Prisma','SendGrid','Agenda'])
    return {
      title: `DECISION: Use ${chosen} for ${topic(area,i)}`,
      content: `**Decision:** Use **${chosen}** instead of ${rejected} for ${topic(area,i)}.\n\n**Why ${chosen}:**\n- ${pick(['Simpler API with less boilerplate','Better TypeScript support','Smaller bundle size','More active community'])}\n- ${pick(['Performance benchmarks showed 40% improvement','Reduces cognitive load','Aligns with our existing stack'])}\n\n**Why not ${rejected}:**\n- ${pick(['Too much boilerplate','Learning curve too steep','Overkill for current scale','License incompatibility'])}\n\n**Decision made by:** ${rAuthor()} + ${rAuthor()}`,
      tags: [area, chosen.toLowerCase(), 'architecture', 'decision'],
    }
  },

  INSIGHT: (i, area) => ({
    title: `INSIGHT: ${topic(area,i)} — ${pick(['unexpected behavior','performance finding','hidden assumption','usage pattern observed'])}`,
    content: `**Discovery:** While working on ${topic(area,i)}, we found something non-obvious.\n\n**What we discovered:**\n${pick(['The operation is O(n²) when collections exceed 1000 items.','The library makes an undocumented network call on initialization.','Users on mobile prefer the simplified version over the feature-rich desktop one.','The "slow" part is not the DB query — it\'s the JSON serialization.','Caching this endpoint reduced server costs by 60%.'])}\n\n**Impact:** ${pick(['Low — good to know','Medium — affects ~20% of users','High — should inform future architecture'])}\n\n**How we found it:** ${pick(['Load testing revealed it','A customer reported it','Noticed in traces','Code review uncovered it'])}`,
    tags: [area, topic(area,i).split(' ')[0].toLowerCase(), 'insight', 'learning'],
  }),

  PATTERN: (i, area) => ({
    title: `PATTERN: ${topic(area,i)} — proven approach`,
    content: `**Pattern:** A reusable solution for ${topic(area,i)} validated in production.\n\n**When to use it:**\n${pick(['Every time you need to fetch data that depends on another fetch.','Whenever you create a form that needs validation.','Any time you need to show loading states without layout shift.','When implementing any feature that needs to work offline-first.'])}\n\n**Why this works here:**\n${pick(['Consistent with the rest of the codebase','Handles edge cases we found in production','Tested with our specific data shapes and API contracts'])}\n\n**Examples:** \`src/${area}/hooks/\`, \`src/${area}/utils/\``,
    tags: [area, topic(area,i).split(' ')[0].toLowerCase(), 'pattern', 'reusable'],
  }),

  ANTI_PATTERN: (i, area) => ({
    title: `ANTI-PATTERN: Do NOT do this with ${topic(area,i)}`,
    content: `**What to avoid:** A specific approach for ${topic(area,i)} that looks reasonable but causes problems.\n\n**Why it fails:**\n${pick(['This caused a memory leak in production that accumulated ~200MB/hour.','We had a security incident because of this pattern.','This produces N+1 queries. At 1000 products it makes 1001 DB calls.','Works in dev but fails under load — discovered in a load test.'])}\n\n**Do this instead:**\n${pick(['Use the withRetry utility with exponential backoff.','Always go through the service layer, never call the repo directly.','Use parameterized queries — never string concatenation.','Add explicit transaction rollback on error.'])}\n\n**Discovered by:** ${rAuthor()} after ${pick(['a production incident','3 hours of debugging','a security audit'])}`,
    tags: [area, topic(area,i).split(' ')[0].toLowerCase(), 'anti-pattern', 'warning'],
  }),

  REPOSITORY_NOTE: (i, area) => {
    const paths = { frontend: ['src/components/','src/hooks/','src/stores/','src/pages/'], backend: ['src/routes/','src/services/','src/middleware/','src/models/'], infra: ['docker/','scripts/','.github/workflows/','nginx/'], general: ['docs/','scripts/','packages/','.env.example'] }
    const path = pick(paths[area])
    return {
      title: `REPO: ${path} — structure for ${topic(area,i)}`,
      content: `**Location:** \`${path}\`\n\n**What lives here:**\n${pick([`All reusable ${topic(area,i)} logic. Each file exports one default.`,`This directory contains ${topic(area,i)} implementations. Files are named by feature.`,`Generated files. Do not commit changes here.`])}\n\n**Naming conventions:**\n- Files: kebab-case\n- Exports: PascalCase for components, camelCase for functions\n\n**What NOT to put here:**\n${pick(['Don\'t put test files here — they go in __tests__/ next to the file.','Don\'t put shared utilities here — those go in src/shared/.',"Don't hardcode environment-specific values — use process.env."])}`,
      tags: [area, 'repository', 'structure', topic(area,i).split(' ')[0].toLowerCase()],
    }
  },

  TASK_CONTEXT: (i, area) => ({
    title: `TASK: ${topic(area,i)} migration — ${pick(['in progress','~60% done','blocked','just started'])}`,
    content: `**Task:** Ongoing work on ${topic(area,i)}.\n\n**What's been done:**\n${pick(['- Migrated 7 of 12 components to the new pattern\n- Unit tests passing for completed components','- Database schema migration written and tested\n- API endpoints updated for v2\n- Frontend not yet updated','- Docker configuration updated\n- CI/CD pipeline modified\n- Waiting on infra team'])}\n\n**What's pending:**\n${pick(['- [ ] Remaining components\n- [ ] Integration tests\n- [ ] Performance benchmark comparison\n- [ ] Update documentation','- [ ] Frontend migration\n- [ ] End-to-end tests\n- [ ] Rollback plan\n- [ ] Stakeholder sign-off'])}\n\n**Branch:** \`feat/${topic(area,i).split(' ')[0].toLowerCase()}-migration\``,
    tags: [area, topic(area,i).split(' ')[0].toLowerCase(), 'in-progress', 'task'],
  }),

  SUMMARY: (i, area) => {
    const period = i < 30 ? 'last week' : i < 60 ? 'last sprint' : `sprint ${Math.floor(i/10)+1}`
    return {
      title: `SUMMARY: ${area} work — ${period}`,
      content: `## Executive Summary\nThis session covered key areas of ${area}. ${Math.floor(Math.random()*3)+2} significant issues were resolved and ${Math.floor(Math.random()*2)+1} architectural decisions were made.\n\n## Key Knowledge Preserved\n${pick(['- JWT refresh token flow now uses rotating tokens\n- DB queries reduced from 1.2s to 80ms after composite index\n- Decided against GraphQL subscriptions — SSE sufficient','- React Query replaces all manual fetch/useEffect patterns\n- Bundle size reduced 40% after lazy-loading checkout module\n- Mobile performance now scores 92 on Lighthouse','- Docker builds now use multi-stage with build cache — CI down from 8min to 2min\n- PostgreSQL replica configured for read-heavy endpoints'])}\n\n## Period\n${period} · Area: ${area} · ${Math.floor(Math.random()*20)+10} entries referenced\nAuthor: ${rAuthor()}`,
      tags: [area, 'summary', 'compacted', period.split(' ')[0]],
    }
  },
}

// ── Inserción en DB ───────────────────────────────────────────────────────────

async function ensureProject() {
  const r = await pool.query('SELECT id FROM projects WHERE slug = $1', [PROJECT])
  if (r.rows.length > 0) return r.rows[0].id
  const ins = await pool.query(
    `INSERT INTO projects (slug, name, description) VALUES ($1,$2,$3) RETURNING id`,
    [PROJECT, 'Ecommerce Platform', 'Seed data — team-memory system tests']
  )
  return ins.rows[0].id
}

async function insert({ projectId, area, type, title, content, tags, author, createdAt, accessCount, lastAccessed, embedding }) {
  const emb = embedding ? `[${embedding.join(',')}]` : null
  await pool.query(
    `INSERT INTO memory_entries
       (project_id, area, type, title, content, tags, author, status,
        access_count, last_accessed, embedding, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$9,$10::vector,$11,$11)`,
    [projectId, area, type, title, content, tags, author, accessCount, lastAccessed, emb, createdAt]
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TYPES = ['BUG','FIX','DECISION','INSIGHT','PATTERN','ANTI_PATTERN','REPOSITORY_NOTE','TASK_CONTEXT','SUMMARY']

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║   team-memory — Seed Script v2                       ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`Modo: ${QUICK ? '⚡ QUICK (sin embeddings)' : '🧠 FULL (con embeddings)'}`)
  console.log(`Total: ${TYPES.length} tipos × ${PER_TYPE} = ${TYPES.length * PER_TYPE} entradas\n`)

  if (CLEAN) {
    console.log('🧹 Limpiando datos previos...')
    await pool.query('DELETE FROM projects WHERE slug = $1', [PROJECT])
    console.log('   Listo.\n')
  }

  const projectId = await ensureProject()
  console.log(`📁 Proyecto: ${PROJECT} (${projectId})\n`)

  let total = 0
  for (const type of TYPES) {
    process.stdout.write(`Seeding ${type.padEnd(18)} `)
    const gen = generators[type]
    for (let i = 0; i < PER_TYPE; i++) {
      const area        = rArea()
      const { title, content, tags } = gen(i, area)
      const createdAt   = getTimestamp(i)
      const accessCount = getAccessCount(i)
      const lastAccessed= getLastAccessed(i, createdAt)
      const author      = rAuthor()
      const embedding   = await embed(`${title}\n\n${content}\n\nTags: ${tags.join(', ')}`)
      await insert({ projectId, area, type, title, content, tags, author, createdAt, accessCount, lastAccessed, embedding })
      total++
      if ((i + 1) % 10 === 0) process.stdout.write('█')
    }
    console.log(` ✓`)
  }

  // Insertar dos entradas con título casi idéntico para probar deduplicación
  console.log('\n🧪 Insertando entradas de prueba de deduplicación...')
  await pool.query(
    `INSERT INTO memory_entries (project_id, area, type, title, content, tags, author, status)
     VALUES ($1,'frontend','DECISION','DECISION: Use Zustand for state management',
             'We decided to use Zustand because Redux was too verbose for our project size.',
             ARRAY['zustand','redux','state-management'], 'lucas', 'active'),
            ($1,'frontend','DECISION','DECISION: Use Zustand for state management',
             'Duplicate entry — should be blocked by dedup check.',
             ARRAY['zustand','state'], 'sofia', 'active')`,
    [projectId]
  )
  console.log('   ✓ 2 entradas con título idéntico insertadas (duplicate_risk test)\n')

  // Stats finales
  const stats = await pool.query(
    `SELECT type, COUNT(*) as count,
            ROUND(AVG(access_count),1) as avg_access,
            COUNT(*) FILTER (WHERE access_count = 0) as never_accessed,
            COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '90 days' AND access_count < 5) as compact_candidates
     FROM memory_entries WHERE project_id = $1
     GROUP BY type ORDER BY type`, [projectId]
  )

  console.log(`✅ Total insertadas: ${total + 2}`)
  console.log('')
  console.log('┌──────────────────┬───────┬────────────┬─────────────────┬────────────────────┐')
  console.log('│ Type             │ Count │ Avg access │ Never accessed  │ Compact candidates │')
  console.log('├──────────────────┼───────┼────────────┼─────────────────┼────────────────────┤')
  for (const r of stats.rows) {
    console.log(`│ ${r.type.padEnd(16)} │ ${String(r.count).padEnd(5)} │ ${String(r.avg_access).padEnd(10)} │ ${String(r.never_accessed).padEnd(15)} │ ${String(r.compact_candidates).padEnd(18)} │`)
  }
  console.log('└──────────────────┴───────┴────────────┴─────────────────┴────────────────────┘')
  await pool.end()
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
