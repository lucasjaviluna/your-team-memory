import test from 'node:test'
import assert from 'node:assert/strict'
import { checkConnection, pool, query } from '../src/db/client.js'
import {
  checkChatModel,
  checkOllamaConnection,
  generateEmbedding,
} from '../src/embeddings/ollama.js'

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

  await pool.end()
})
