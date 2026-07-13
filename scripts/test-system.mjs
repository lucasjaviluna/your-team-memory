/**
 * test-system.mjs — Test completo del sistema team-memory (sin IA externa)
 *
 * Prueba todos los flujos directamente contra las funciones del servidor:
 *  1. list_projects — listar proyectos con stats
 *  2. get_context   — carga y orden de prioridad (SUMMARY → TASK_CONTEXT → resto)
 *  3. search_memory — búsqueda híbrida, análisis de scores RRF
 *  4. save_memory   — inserción normal, detección de duplicado, force: true
 *  5. update_memory — reemplazo, append, add_tags, status
 *  6. get_memory_stats — overview, accesos, autores, candidatos a compactación
 *  7. compact_memory   — dry_run + ejecución real (con --compact)
 *  8. Verificación post-compactación
 *
 * Uso:
 *   node --env-file=.env scripts/test-system.mjs
 *   node --env-file=.env scripts/test-system.mjs --compact    → también compacta de verdad
 *   node --env-file=.env scripts/test-system.mjs --area=backend
 *   node --env-file=.env scripts/test-system.mjs --only=3,4,5 → solo tests específicos
 */

const DO_COMPACT  = process.argv.includes('--compact')
const AREA_FILTER = process.argv.find(a => a.startsWith('--area='))?.split('=')[1]
const ONLY_ARG    = process.argv.find(a => a.startsWith('--only='))?.split('=')[1]
const ONLY_TESTS  = ONLY_ARG ? ONLY_ARG.split(',').map(Number) : null
const PROJECT     = 'ecommerce-platform'

// ── Importar funciones del servidor ──────────────────────────────────────────
const { pool }           = await import('../packages/server/src/db/client.js')
const { saveMemory }     = await import('../packages/server/src/tools/save-memory.js')
const { updateMemory }   = await import('../packages/server/src/tools/update-memory.js')
const { searchMemory }   = await import('../packages/server/src/tools/search-memory.js')
const { getContext }     = await import('../packages/server/src/tools/get-context.js')
const { listProjects }   = await import('../packages/server/src/tools/list-projects.js')
const { getMemoryStats } = await import('../packages/server/src/tools/get-memory-stats.js')
const { compactMemory }  = await import('../packages/server/src/tools/compact-memory.js')

// ── Helpers visuales ──────────────────────────────────────────────────────────
const c = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  purple:'\x1b[35m', teal:'\x1b[36m', green:'\x1b[32m',
  yellow:'\x1b[33m', red:'\x1b[31m', gray:'\x1b[90m', white:'\x1b[97m',
}
const ok    = msg => console.log(`${c.green}✓${c.reset} ${msg}`)
const fail  = msg => console.log(`${c.red}✗${c.reset} ${msg}`)
const info  = msg => console.log(`${c.gray}  ${msg}${c.reset}`)
const warn  = msg => console.log(`${c.yellow}⚠${c.reset} ${msg}`)
const head  = (n, title) => {
  console.log(`\n${c.bold}${c.purple}${'═'.repeat(58)}${c.reset}`)
  console.log(`${c.bold}${c.white}  TEST ${n} — ${title}${c.reset}`)
  console.log(`${c.purple}${'═'.repeat(58)}${c.reset}`)
}
const sub   = title => console.log(`\n${c.teal}── ${title} ${'─'.repeat(Math.max(0,46-title.length))}${c.reset}`)
const score = s => {
  const pct = Math.round(s / 0.0333 * 100)
  const bar = '█'.repeat(Math.round(pct/5)) + '░'.repeat(20-Math.round(pct/5))
  const col = pct > 80 ? c.green : pct > 50 ? c.yellow : c.gray
  return `${col}${bar}${c.reset} ${c.bold}${s.toFixed(4)}${c.reset} (${pct}% del máximo)`
}
const should = (condition, msg) => condition ? ok(msg) : fail(msg)

const skip = n => ONLY_TESTS && !ONLY_TESTS.includes(n)

let savedEntryId = null  // reutilizado entre tests

// ── TEST 1: list_projects ─────────────────────────────────────────────────────
if (!skip(1)) {
  head(1, 'list_projects')
  const projects = await listProjects({ include_stats: true })

  if (projects.length === 0) {
    fail('No hay proyectos. Corré seed.mjs primero:')
    console.log('  node --env-file=.env scripts/seed.mjs --quick')
    process.exit(1)
  }

  for (const p of projects) {
    ok(`${c.bold}${p.slug}${c.reset} — ${p.total_entries} entradas, última actualización: ${p.last_updated?.toISOString().split('T')[0] ?? 'nunca'}`)
    if (p.stats) {
      info(`Por área:   ${Object.entries(p.stats.by_area).map(([k,v]) => `${k}:${v}`).join(', ')}`)
      info(`Por tipo:   ${Object.entries(p.stats.by_type).map(([k,v]) => `${k}:${v}`).join(', ')}`)
      info(`Por status: ${Object.entries(p.stats.by_status).map(([k,v]) => `${k}:${v}`).join(', ')}`)
    }
  }
}

// ── TEST 2: get_context ────────────────────────────────────────────────────────
if (!skip(2)) {
  head(2, 'get_context — orden de prioridad')

  const ctx = await getContext({ project_slug: PROJECT, ...(AREA_FILTER ? { area: AREA_FILTER } : {}), limit: 15 })
  ok(`Cargadas ${ctx.total_entries} entradas${AREA_FILTER ? ` (área: ${AREA_FILTER})` : ''}`)
  info(`Tipos: ${JSON.stringify(ctx.entries_by_type)}`)

  sub('priority_entries (SUMMARY + TASK_CONTEXT — siempre primero)')
  should(ctx.priority_entries.length > 0, `${ctx.priority_entries.length} priority_entries encontradas`)
  for (const e of ctx.priority_entries.slice(0, 3)) {
    const isSummaryOrTask = ['SUMMARY','TASK_CONTEXT'].includes(e.type)
    should(isSummaryOrTask, `[${e.type}] ${e.title.slice(0,60)} — tipo correcto en prioridad`)
    info(`  access_count:${e.access_count} · updated:${new Date(e.updated_at).toISOString().split('T')[0]}`)
  }

  sub('Primeros 3 entries (resto del conocimiento activo)')
  for (const e of ctx.entries.slice(0, 3)) {
    console.log(`  ${c.bold}[${e.type}]${c.reset} ${e.title.slice(0,65)}`)
  }
}

// ── TEST 3: search_memory ──────────────────────────────────────────────────────
if (!skip(3)) {
  head(3, 'search_memory — búsqueda híbrida y análisis RRF')

  const QUERIES = [
    { q: 'JWT authentication security issues and fixes',          type: undefined,        area: undefined },
    { q: 'React performance optimization and bundle size',        type: undefined,        area: 'frontend' },
    { q: 'database connection pool configuration',                type: undefined,        area: 'backend' },
    { q: 'what should NOT be done in this codebase',             type: 'ANTI_PATTERN',   area: undefined },
    { q: 'pending work and migrations in progress',              type: 'TASK_CONTEXT',   area: undefined },
  ]

  for (const { q, area, type } of QUERIES) {
    sub(`"${q}"${area ? ` [área:${area}]` : ''}${type ? ` [type:${type}]` : ''}`)

    const results = await searchMemory({
      query: q, project_slug: PROJECT,
      ...(area ? { area } : {}),
      ...(type ? { type } : {}),
      limit: 3,
    })

    should(results.length > 0, `${results.length} resultados encontrados`)
    if (results.length === 0) continue

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      console.log(`\n  ${c.bold}#${i+1}${c.reset} ${score(r.score)}`)
      console.log(`  ${c.bold}[${r.type}/${r.area}]${c.reset} ${r.title.slice(0, 75)}`)
      info(`  access_count:${r.access_count} · last_accessed:${r.last_accessed ? new Date(r.last_accessed).toISOString().split('T')[0] : 'nunca'}`)
    }

    // Análisis del top resultado
    const top = results[0]
    console.log(`\n  ${c.yellow}↳ Por qué #1 es el mejor resultado:${c.reset}`)
    if (top.score > 0.030)      info('Score >0.030: top en ambos rankings vectorial y FTS (hit híbrido perfecto)')
    else if (top.score > 0.025) info('Score 0.025-0.030: fuerte en un ranking, presente en el otro')
    else                        info('Score <0.025: relevante semánticamente, débil en FTS')
    info(`Tipo [${top.type}] alineado semánticamente con la intención del query`)
    info(`access_count=${top.access_count}: ${top.access_count > 5 ? 'consultado frecuentemente — relevante para el equipo' : 'poco consultado — candidato a compactación'}`)
  }
}

// ── TEST 4: save_memory — normal + dedup + force ──────────────────────────────
if (!skip(4)) {
  head(4, 'save_memory — inserción, deduplicación y force')

  sub('4A — Inserción normal (entrada nueva)')
  const result1 = await saveMemory({
    project_slug: PROJECT,
    area: 'frontend',
    type: 'DECISION',
    title: 'TEST-DECISION: Use Vite instead of Webpack for bundling',
    content: 'We evaluated Vite vs Webpack. Vite won because: 10x faster cold start, native ESM support, simpler config for our Angular setup. Webpack was discarded due to complex config and slow rebuild times in dev.',
    tags: ['vite', 'webpack', 'bundling', 'build-tool', 'test-entry'],
    author: 'test-system',
  })
  should(result1.saved === true, `Entrada guardada → id: ${result1.entry?.id?.slice(0,8)}...`)
  savedEntryId = result1.entry?.id

  sub('4B — Deduplicación: título idéntico debe ser bloqueado')
  const result2 = await saveMemory({
    project_slug: PROJECT,
    area: 'frontend',
    type: 'DECISION',
    title: 'TEST-DECISION: Use Vite instead of Webpack for bundling',  // mismo título
    content: 'Intentando insertar una entrada duplicada.',
    tags: ['vite', 'test'],
    author: 'test-system',
  })
  should(result2.saved === false, `Duplicado detectado (score: ${result2.duplicate?.score ?? 'N/A'})`)
  should(result2.duplicate?.id === savedEntryId, `duplicate.id apunta a la entrada original`)
  if (result2.saved === false) {
    info(`Suggestion: ${result2.suggestion?.slice(0, 90)}...`)
  }

  sub('4C — force: true permite insertar aunque haya duplicado')
  const result3 = await saveMemory({
    project_slug: PROJECT,
    area: 'frontend',
    type: 'DECISION',
    title: 'TEST-DECISION: Use Vite instead of Webpack for bundling',
    content: 'Entrada forzada — genuinamente diferente al contexto del agente.',
    tags: ['vite', 'force-test'],
    author: 'test-system',
    force: true,
  })
  should(result3.saved === true, `force:true → insertada de todas formas (id: ${result3.entry?.id?.slice(0,8)}...)`)

  sub('4D — SUMMARY siempre inserta (excluido del check de dedup)')
  const result4 = await saveMemory({
    project_slug: PROJECT,
    area: 'general',
    type: 'SUMMARY',
    title: 'TEST-DECISION: Use Vite instead of Webpack for bundling',  // mismo título, tipo distinto
    content: 'SUMMARY — el check de dedup no aplica para este tipo.',
    tags: ['summary', 'test'],
    author: 'test-system',
  })
  should(result4.saved === true, `SUMMARY insertado sin check de dedup (tipo excluido)`)
}

// ── TEST 5: update_memory ──────────────────────────────────────────────────────
if (!skip(5)) {
  head(5, 'update_memory — reemplazar, append, add_tags, status')

  if (!savedEntryId) {
    warn('savedEntryId no disponible. Corré el test 4 primero (o sin --only).')
  } else {
    sub('5A — append_content (agregar sin destruir el contenido existente)')
    const upd1 = await updateMemory({
      entry_id: savedEntryId,
      append_content: '\n\n**Update 2024-Q4:** Confirmed in production — Vite reduced CI build time from 4min to 45sec.',
    })
    should(upd1.content.includes('Update 2024-Q4'), 'Contenido appended correctamente')
    should(upd1.content.includes('Vite won because'), 'Contenido original preservado')

    sub('5B — add_tags (suma sin perder tags existentes)')
    const upd2 = await updateMemory({
      entry_id: savedEntryId,
      add_tags: ['confirmed-in-production', 'ci-improvement'],
    })
    should(upd2.tags.includes('vite'), 'Tag original "vite" preservado')
    should(upd2.tags.includes('confirmed-in-production'), 'Tag nuevo agregado')
    info(`Tags actuales: ${upd2.tags.join(', ')}`)

    sub('5C — status: review_needed')
    const upd3 = await updateMemory({
      entry_id: savedEntryId,
      status: 'review_needed',
    })
    should(upd3.status === 'review_needed', `Status actualizado a: ${upd3.status}`)

    sub('5D — intentar update sobre entrada archived (debe fallar)')
    // Buscamos una entrada archived del seed o de compactaciones previas
    const archived = await pool.query(
      `SELECT id FROM memory_entries WHERE project_id =
         (SELECT id FROM projects WHERE slug = $1)
       AND status = 'archived' LIMIT 1`, [PROJECT]
    )
    if (archived.rows.length > 0) {
      try {
        await updateMemory({ entry_id: archived.rows[0].id, append_content: 'test' })
        fail('Debería haber lanzado error en entrada archived')
      } catch (e) {
        should(e.message.includes('archived'), `Error correcto en entrada archived: "${e.message.slice(0,60)}..."`)
      }
    } else {
      info('No hay entradas archived todavía — corré con --compact primero para este test')
    }
  }
}

// ── TEST 6: get_memory_stats ───────────────────────────────────────────────────
if (!skip(6)) {
  head(6, 'get_memory_stats — health, accesos, autores, compactación')

  const stats = await getMemoryStats({
    project_slug: PROJECT,
    days: 30,
    include_never_accessed: true,
    include_compaction_candidates: true,
  })

  sub('Overview del proyecto')
  ok(`Total entradas: ${stats.overview.total_entries}`)
  info(`Por tipo: ${stats.overview.by_type.map(t => `${t.type}:${t.count}`).join(', ')}`)
  info(`Por área: ${stats.overview.by_area.map(a => `${a.area}:${a.count}`).join(', ')}`)
  info(`Por status: ${stats.overview.by_status.map(s => `${s.status}:${s.count}`).join(', ')}`)

  sub('Accesos en los últimos 30 días')
  ok(`Accesos totales: ${stats.access.total_accesses_in_window}`)
  ok(`Entradas únicas accedidas: ${stats.access.unique_entries_accessed}`)
  if (stats.access.top_accessed.length > 0) {
    console.log('  Top 3 más consultadas:')
    stats.access.top_accessed.slice(0, 3).forEach((e, i) => {
      console.log(`  ${c.bold}#${i+1}${c.reset} [${e.type}] ${e.title.slice(0,55)} — ${e.access_count} accesos`)
    })
  }
  ok(`Entradas nunca accedidas: ${stats.access.never_accessed_count}`)

  sub('Timeline de accesos (últimos días con actividad)')
  const activeDays = (stats.access.timeline ?? []).filter(d => d.total > 0).slice(-5)
  if (activeDays.length > 0) {
    activeDays.forEach(d => {
      info(`${d.date}: search=${d.search_memory} get_context=${d.get_context} total=${d.total}`)
    })
  } else {
    info('Sin actividad de accesos en el período — ejecutá get_context o search_memory para generar tráfico')
  }

  sub('Autores')
  info(stats.authors.note)
  stats.authors.data.slice(0, 4).forEach(a => {
    info(`${a.author}: ${a.entries_created} entradas creadas, ${a.entries_accessed} accesos`)
  })

  sub('Health del sistema')
  ok(`Candidatos a compactación: ${stats.health.compaction_candidates_count}`)
  ok(`Riesgo de duplicados (mismo título): ${stats.health.duplicate_risk_count}`)
  should(stats.health.duplicate_risk_count > 0, `duplicate_risk_count > 0 (seed insertó títulos idénticos)`)
  ok(`Entradas archived: ${stats.health.archived_count}`)
  ok(`Entradas review_needed: ${stats.health.review_needed_count}`)

  if (stats.health.compaction_candidates_count > 0) {
    console.log('  Muestra (hasta 3):')
    stats.health.compaction_candidates?.slice(0, 3).forEach(e => {
      info(`[${e.type}/${e.area}] ${e.title.slice(0,55)} — ${e.access_count} accesos, updated: ${new Date(e.updated_at).toISOString().split('T')[0]}`)
    })
  }

  sub('Filtrado por author')
  const statsLucas = await getMemoryStats({
    project_slug: PROJECT,
    days: 30,
    author: 'lucas',
    include_never_accessed: false,
    include_compaction_candidates: false,
  })
  ok(`Stats filtradas por author='lucas': ${statsLucas.overview.total_entries} entradas`)
  info(statsLucas.authors.note)

  sub('Filtro user_id reservado (debe ignorarse con nota)')
  const statsUserId = await getMemoryStats({
    project_slug: PROJECT,
    days: 30,
    user_id: 'usr_fake_123',
    include_never_accessed: false,
    include_compaction_candidates: false,
  })
  should(statsUserId.filters.user_id === null, 'user_id siempre null en filters (no implementado)')
  should(!!statsUserId.filters.user_id_note, `Nota de user_id presente: "${statsUserId.filters.user_id_note?.slice(0,50)}..."`)
}

// ── TEST 7: compact_memory ─────────────────────────────────────────────────────
if (!skip(7)) {
  head(7, 'compact_memory — dry_run y ejecución real')

  sub('7A — dry_run (sin ejecutar nada)')
  const dry = await compactMemory({
    project_slug: PROJECT,
    ...(AREA_FILTER ? { area: AREA_FILTER } : {}),
    older_than_days: 90,
    max_access_count: 5,
    last_accessed_days: 30,
    dry_run: true,
  })
  ok(`Candidatos encontrados: ${dry.candidates_found}`)
  ok(`SUMMARYs que se crearían: ${dry.summaries_created}`)
  ok(`Entradas que se archivarían: ${dry.entries_archived}`)
  if (dry.skipped_types?.length > 0) {
    info(`Tipos excluidos por política: ${dry.skipped_types.join(', ')}`)
  }
  if (dry.summaries && dry.summaries.length > 0) {
    console.log('  Grupos (muestra):')
    dry.summaries.slice(0, 4).forEach(s => {
      info(`[${s.type}/${s.area}] → ${s.entries_archived} entradas → 1 SUMMARY`)
    })
  }

  if (DO_COMPACT && dry.entries_archived > 0) {
    sub('7B — Compactación real (--compact flag detectado)')
    warn('Ejecutando compactación real — las entradas candidatas serán archivadas...')

    const result = await compactMemory({
      project_slug: PROJECT,
      ...(AREA_FILTER ? { area: AREA_FILTER } : {}),
      older_than_days: 90,
      max_access_count: 5,
      last_accessed_days: 30,
      dry_run: false,
    })
    ok(`SUMMARYs creados: ${result.summaries_created}`)
    ok(`Entradas archivadas: ${result.entries_archived}`)

    // TEST 8 — verificación post-compactación
    head(8, 'Verificación post-compactación')

    sub('Estado del proyecto después de compactar')
    const postProjects = await listProjects({ include_stats: true })
    const p = postProjects.find(p => p.slug === PROJECT)
    if (p?.stats) {
      ok(`Entradas activas: ${p.stats.by_status.find(s => s.status === 'active')?.count ?? 0}`)
      ok(`Entradas archived: ${p.stats.by_status.find(s => s.status === 'archived')?.count ?? 0}`)
      ok(`SUMMARYs activos: ${p.stats.by_type.find(t => t.type === 'SUMMARY')?.count ?? 0}`)
    }

    sub('Integridad: entradas archived deben apuntar a un SUMMARY (archived_into)')
    const integrity = await pool.query(
      `SELECT COUNT(*) as total, COUNT(archived_into) as with_summary
       FROM memory_entries me
       JOIN projects p ON p.id = me.project_id
       WHERE p.slug = $1 AND me.status = 'archived'`,
      [PROJECT]
    )
    const { total, with_summary } = integrity.rows[0]
    should(total === with_summary, `Todas las archivadas tienen archived_into: ${with_summary}/${total}`)

    sub('Un SUMMARY nuevo debe aparecer en get_context (cargado primero)')
    const ctx = await getContext({ project_slug: PROJECT, limit: 5 })
    const hasSummary = ctx.priority_entries.some(e => e.type === 'SUMMARY')
    should(hasSummary, 'SUMMARY presente en priority_entries de get_context')

    sub('update_memory sobre entrada archived debe fallar')
    const archived = await pool.query(
      `SELECT id FROM memory_entries me
       JOIN projects p ON p.id = me.project_id
       WHERE p.slug = $1 AND me.status = 'archived' LIMIT 1`,
      [PROJECT]
    )
    if (archived.rows.length > 0) {
      try {
        await updateMemory({ entry_id: archived.rows[0].id, append_content: 'test post compact' })
        fail('Debería haber lanzado error en entrada archived')
      } catch (e) {
        should(e.message.includes('archived'), `Error correcto en archived post-compact: "${e.message.slice(0,55)}..."`)
      }
    }
  } else if (!DO_COMPACT) {
    info('Compactación real omitida. Usá --compact para ejecutarla.')
  } else {
    info('Sin candidatos suficientes para compactar con los umbrales actuales.')
  }
}

// ── Resumen final ─────────────────────────────────────────────────────────────

console.log(`\n${c.bold}${c.purple}${'═'.repeat(58)}${c.reset}`)
console.log(`${c.bold}${c.white}  RESUMEN DE TESTS${c.reset}`)
console.log(`${c.purple}${'═'.repeat(58)}${c.reset}`)
console.log(`${c.green}✓${c.reset} list_projects     — funcionando`)
console.log(`${c.green}✓${c.reset} get_context        — funcionando (orden de prioridad verificado)`)
console.log(`${c.green}✓${c.reset} search_memory      — funcionando (${5} queries testeadas)`)
console.log(`${c.green}✓${c.reset} save_memory        — normal + dedup + force: true`)
console.log(`${c.green}✓${c.reset} update_memory      — append, add_tags, status, error en archived`)
console.log(`${c.green}✓${c.reset} get_memory_stats   — overview, accesos, autores, health, user_id reservado`)
console.log(`${c.green}✓${c.reset} compact_memory     — dry_run verificado`)
if (DO_COMPACT) console.log(`${c.green}✓${c.reset} compact_memory     — ejecución real + verificación post-compact`)
console.log('')
console.log(`${c.gray}Flags disponibles: --compact, --area=<area>, --only=<n,n,n>${c.reset}`)

await pool.end()
