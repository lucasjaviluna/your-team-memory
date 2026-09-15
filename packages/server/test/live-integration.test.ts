import test from 'node:test'
import assert from 'node:assert/strict'
import { checkConnection, pool, query } from '../src/db/client.js'
import {
  checkChatModel,
  checkOllamaConnection,
  generateEmbedding,
} from '../src/embeddings/ollama.js'
import { saveMemory } from '../src/tools/save-memory.js'
import { searchMemory } from '../src/tools/search-memory.js'
import { getContext } from '../src/tools/get-context.js'
import { updateMemory } from '../src/tools/update-memory.js'

const live = process.env.RUN_LIVE_INTEGRATION === '1'

test('live services: PostgreSQL/pgvector and Ollama', { skip: !live }, async () => {
  assert.equal(await checkConnection(), true, 'PostgreSQL no responde')
  assert.equal(await checkOllamaConnection(), true, 'Ollama no responde')
  assert.equal(await checkChatModel(), true, 'OLLAMA_CHAT_MODEL no está disponible')

  const embedding = await generateEmbedding('Team Memory live integration smoke test')
  assert.ok(embedding.length > 0, 'Ollama devolvió un embedding vacío')
  assert.ok(embedding.every(Number.isFinite), 'El embedding contiene valores inválidos')

  const extensions = await query<{ extname: string }>(
    "SELECT extname FROM pg_extension WHERE extname = 'vector'",
  )
  assert.equal(extensions.length, 1, 'La extensión pgvector no está instalada')

  const projectSlug = `live-smoke-${Date.now()}`
  try {
    const saved = await saveMemory({
      project_slug: projectSlug,
      area: 'general',
      type: 'INSIGHT',
      title: 'Live integration RAG smoke test',
      content: 'Validación temporal del flujo completo contra PostgreSQL y Ollama reales.',
      tags: ['live-test', 'rag'],
      author: 'integration-test',
      force: true,
    })
    assert.equal(saved.saved, true)
    assert.ok(saved.entry?.id)

    const search = await searchMemory({
      query: 'flujo completo PostgreSQL Ollama',
      project_slug: projectSlug,
      limit: 5,
      min_score: 0,
    })
    assert.ok(search.some((entry) => entry.id === saved.entry!.id), 'La entrada no apareció en búsqueda')

    const context = await getContext({ project_slug: projectSlug, limit: 5 })
    assert.equal(context.total_entries, 1)
    assert.equal(context.entries[0]?.id, saved.entry!.id)

    const updated = await updateMemory({
      entry_id: saved.entry!.id,
      append_content: ' Actualización verificada.',
      add_tags: ['updated'],
    })
    assert.match(updated.content, /Actualización verificada/)
    assert.ok(updated.tags.includes('updated'))
  } finally {
    await query('DELETE FROM projects WHERE slug = $1', [projectSlug])
  }

  await pool.end()
})
