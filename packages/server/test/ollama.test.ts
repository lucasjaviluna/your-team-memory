import assert from 'node:assert/strict'
import test from 'node:test'

process.env.OLLAMA_TIMEOUT_MS = '25'
const { generateEmbedding, generateText, buildEmbeddingText } = await import('../src/embeddings/ollama.js')

const originalFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('generateEmbedding validates the provider vector', async () => {
  let receivedSignal: AbortSignal | undefined
  globalThis.fetch = async (_input, init) => {
    receivedSignal = init?.signal as AbortSignal
    return new Response(JSON.stringify({ embedding: [0.1, 0.2] }), { status: 200 })
  }
  assert.deepEqual(await generateEmbedding('query'), [0.1, 0.2])
  assert.equal(receivedSignal instanceof AbortSignal, true)
})

test('generateEmbedding rejects malformed provider responses', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ embedding: [] }), { status: 200 })
  await assert.rejects(() => generateEmbedding('query'), /invalid vector/)
})

test('generateText exposes upstream HTTP failures', async () => {
  globalThis.fetch = async () => new Response('model unavailable', { status: 503 })
  await assert.rejects(() => generateText('prompt'), /Ollama generate failed \(503\)/)
})

test('buildEmbeddingText bounds provider input without changing stored content', () => {
  const content = 'inicio importante ' + 'x'.repeat(20_000) + ' final importante'
  const result = buildEmbeddingText('Título crítico', content, ['tag-rag'])
  assert.ok(result.length <= 4_000)
  assert.match(result, /Título crítico/)
  assert.match(result, /tag-rag/)
  assert.match(result, /inicio importante/)
  assert.match(result, /final importante/)
  assert.match(result, /contenido intermedio omitido/)
})
