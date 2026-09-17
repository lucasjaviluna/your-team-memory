import { z } from 'zod'
import { query, queryOne } from '../db/client.js'

export const GetMemoryRevisionsSchema = z.object({
  entry_id: z.string().uuid().describe('UUID of the memory entry'),
  limit: z.number().int().min(1).max(50).optional().default(20)
    .describe('Maximum number of revisions to return'),
  offset: z.number().int().min(0).max(10_000).optional().default(0)
    .describe('Number of newest revisions to skip'),
})

export type GetMemoryRevisionsInput = z.infer<typeof GetMemoryRevisionsSchema>

export interface MemoryRevision {
  id: string
  entry_id: string
  revision: number
  area: string
  type: string
  title: string
  content: string
  tags: string[]
  author: string
  status: string
  created_at: Date
  embedding_model: string | null
  embedding_dimensions: number | null
  embedding_version: string | null
  embedding_generated_at: Date | null
}

export interface MemoryRevisionsResult {
  entry_id: string
  total: number
  limit: number
  offset: number
  has_more: boolean
  revisions: MemoryRevision[]
}

export async function getMemoryRevisions(
  input: GetMemoryRevisionsInput,
): Promise<MemoryRevisionsResult> {
  const { entry_id, limit, offset } = input

  const entry = await queryOne<{ id: string }>(
    'SELECT id FROM memory_entries WHERE id = $1',
    [entry_id],
  )
  if (!entry) throw new Error(`Entry not found: ${entry_id}`)

  const [{ total }] = await query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM memory_entry_revisions WHERE entry_id = $1',
    [entry_id],
  )

  const revisions = await query<MemoryRevision>(
    `SELECT id, entry_id, revision, area, type, title, content, tags, author, status, created_at,
            embedding_model, embedding_dimensions, embedding_version, embedding_generated_at
     FROM memory_entry_revisions
     WHERE entry_id = $1
     ORDER BY revision DESC
     LIMIT $2 OFFSET $3`,
    [entry_id, limit, offset],
  )

  const totalCount = Number(total ?? 0)
  return {
    entry_id,
    total: totalCount,
    limit,
    offset,
    has_more: offset + revisions.length < totalCount,
    revisions,
  }
}
