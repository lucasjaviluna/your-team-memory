const OLLAMA_URL        = process.env.OLLAMA_URL         ?? 'http://localhost:11434'
const EMBED_MODEL       = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'
const CHAT_MODEL        = process.env.OLLAMA_CHAT_MODEL  ?? 'llama3'
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 30_000)

async function ollamaFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${OLLAMA_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

// ── Embeddings ────────────────────────────────────────────────────────────────

interface OllamaEmbedResponse {
  embedding: number[]
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await ollamaFetch('/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ollama embedding failed (${response.status}): ${error}`)
  }
  const data = (await response.json()) as OllamaEmbedResponse
  if (!Array.isArray(data.embedding) || data.embedding.length === 0 ||
      data.embedding.some((value) => !Number.isFinite(value))) {
    throw new Error('Ollama embedding returned an invalid vector')
  }
  return data.embedding
}

export function buildEmbeddingText(title: string, content: string, tags: string[]): string {
  const tagStr = tags.length > 0 ? `Tags: ${tags.join(', ')}` : ''
  return [title, content, tagStr].filter(Boolean).join('\n\n')
}

// ── Text generation (para compact_memory) ────────────────────────────────────

interface OllamaGenerateResponse {
  response: string
  done: boolean
}

/**
 * Genera texto usando el modelo chat de Ollama.
 * Usado exclusivamente por compact_memory para generar SUMMARYs.
 */
export async function generateText(prompt: string): Promise<string> {
  const response = await ollamaFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,   // bajo — queremos consistencia, no creatividad
        num_predict: 2048,  // suficiente para un SUMMARY detallado
      },
    }),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Ollama generate failed (${response.status}): ${error}`)
  }
  const data = (await response.json()) as OllamaGenerateResponse
  if (typeof data.response !== 'string' || data.response.trim().length === 0) {
    throw new Error('Ollama generate returned an empty response')
  }
  return data.response.trim()
}

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const res = await ollamaFetch('/api/tags', { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Verifica que el modelo chat esté disponible en Ollama.
 * Si no está, el usuario debe correr: ollama pull <model>
 */
export async function checkChatModel(): Promise<boolean> {
  try {
    const res = await ollamaFetch('/api/tags', { method: 'GET' })
    if (!res.ok) return false
    const data = await res.json() as { models: Array<{ name: string }> }
    return data.models.some((m) => m.name.startsWith(CHAT_MODEL))
  } catch {
    return false
  }
}
