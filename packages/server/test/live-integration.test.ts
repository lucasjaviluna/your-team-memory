import test from 'node:test'
import assert from 'node:assert/strict'

const live = process.env.RUN_LIVE_INTEGRATION === '1'

test('live services: PostgreSQL/pgvector and Ollama', { skip: !live }, async () => {
  const { checkConnection, pool, query } = await import('../src/db/client.js')
  const { checkChatModel, checkOllamaConnection, generateEmbedding } =
    await import('../src/embeddings/ollama.js')
  const { saveMemory } = await import('../src/tools/save-memory.js')
  const { searchMemory } = await import('../src/tools/search-memory.js')
  const { getContext } = await import('../src/tools/get-context.js')
  const { updateMemory } = await import('../src/tools/update-memory.js')
  const { getMemoryRevisions } = await import('../src/tools/get-memory-revisions.js')
  const { restoreMemoryRevision } = await import('../src/tools/restore-memory-revision.js')

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

    const revisions = await getMemoryRevisions({
      entry_id: saved.entry!.id,
      limit: 10,
      offset: 0,
    })
    assert.equal(revisions.total, 1)
    assert.equal(revisions.revisions[0]?.revision, 1)
    assert.equal('embedding' in (revisions.revisions[0] ?? {}), false)

    const changed = await updateMemory({
      entry_id: saved.entry!.id,
      content: 'Segunda versión que luego será revertida en la integración live.',
    })
    assert.match(changed.content, /Segunda versión/)

    const restored = await restoreMemoryRevision({
      entry_id: saved.entry!.id,
      revision: 1,
      confirm: true,
    })
    assert.equal(restored.restored_revision, 1)
    assert.equal(restored.snapshot_revision, 3)
    assert.match(restored.entry.content, /flujo completo contra PostgreSQL/)

    const revisionsAfterRestore = await getMemoryRevisions({
      entry_id: saved.entry!.id,
      limit: 10,
      offset: 0,
    })
    assert.equal(revisionsAfterRestore.total, 3)
    assert.deepEqual(
      revisionsAfterRestore.revisions.map((revision) => revision.revision),
      [3, 2, 1],
    )

    // LLM generation is intentionally opt-in: it can exceed the normal live
    // integration timeout on CPU-only Ollama environments.
    if (process.env.RUN_LIVE_ROTATION === '1') {
      const { rotateTaskContext } = await import('../src/tools/rotate-task-context.js')
      const taskContext = await saveMemory({
      project_slug: projectSlug,
      area: 'general',
      type: 'TASK_CONTEXT',
      title: 'Live rotation task context',
      content: [
        'Estado activo: implementar la rotación del TASK_CONTEXT y conservar revisiones.',
        'Pendiente: verificar PostgreSQL, Ollama, contratos MCP, concurrencia y rollback.',
        'Hechos: migración 004 aplicada; restore_memory_revision requiere confirmación; el embedding usa nomic-embed-text.',
        'Siguiente paso: ejecutar tests live y documentar la política de umbral de 12000 caracteres.',
      ].join('\n\n'),
      tags: ['live-test', 'task-context'],
      author: 'integration-test',
      force: true,
      })
      assert.equal(taskContext.saved, true)
      const previousLength = taskContext.entry!.content.length

      const rotated = await rotateTaskContext({
        entry_id: taskContext.entry!.id,
        confirm: true,
        force: true,
      })
      assert.equal(rotated.snapshot_revision, 1)
      assert.ok(rotated.new_content_length < previousLength)
      assert.ok(rotated.entry.tags.includes('task-context-rotated'))

      const rotatedRevisions = await getMemoryRevisions({
        entry_id: taskContext.entry!.id,
        limit: 10,
        offset: 0,
      })
      assert.equal(rotatedRevisions.total, 1)
      assert.equal(rotatedRevisions.revisions[0]?.revision, 1)
      assert.equal(rotatedRevisions.revisions[0]?.content.length, previousLength)
    }
  } finally {
    await query('DELETE FROM projects WHERE slug = $1', [projectSlug])
  }

  await pool.end()
})
