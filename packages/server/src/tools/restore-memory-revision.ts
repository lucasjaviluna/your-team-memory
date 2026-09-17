import { z } from 'zod'
import { queryOne, withTransaction } from '../db/client.js'
import { buildEmbeddingText, generateEmbedding, embeddingProfile } from '../embeddings/ollama.js'
import type { MemoryEntry, EntryStatus, EntryType, Area } from '../types/index.js'

export const RestoreMemoryRevisionSchema = z.object({
  entry_id: z.string().uuid().describe('UUID of the memory entry to restore'),
  revision: z.number().int().min(1).describe('Revision number to restore'),
  confirm: z.literal(true).describe('Must be explicitly true. Prevents accidental data changes.'),
})

export type RestoreMemoryRevisionInput = z.infer<typeof RestoreMemoryRevisionSchema>

interface RevisionState {
  entry_id: string
  revision: number
  area: Area
  type: EntryType
  title: string
  content: string
  tags: string[]
  author: string
  status: EntryStatus
}

export interface RestoreMemoryRevisionResult {
  entry: MemoryEntry
  restored_revision: number
  snapshot_revision: number
}

export async function restoreMemoryRevision(
  input: RestoreMemoryRevisionInput,
): Promise<RestoreMemoryRevisionResult> {
  const target = await queryOne<RevisionState>(
    `SELECT entry_id, revision, area, type, title, content, tags, author, status
     FROM memory_entry_revisions
     WHERE entry_id = $1 AND revision = $2`,
    [input.entry_id, input.revision],
  )
  if (!target) {
    throw new Error(`Revision not found: ${input.entry_id}#${input.revision}`)
  }

  const embedding = await generateEmbedding(
    buildEmbeddingText(target.title, target.content, target.tags),
  )
  const embeddingStr = `[${embedding.join(',')}]`
  const profile = embeddingProfile(embedding)

  return withTransaction(async (client) => {
    const current = await client.query<MemoryEntry>(
      'SELECT * FROM memory_entries WHERE id = $1 FOR UPDATE',
      [input.entry_id],
    )
    if (current.rows.length === 0) {
      throw new Error(`Entry not found: ${input.entry_id}`)
    }
    const currentEntry = current.rows[0]
    if (currentEntry.status === 'archived') {
      throw new Error(
        `Entry ${input.entry_id} is archived (compacted into a SUMMARY). ` +
        'Archived entries cannot be restored directly.',
      )
    }

    const revision = await client.query<RevisionState>(
      `SELECT entry_id, revision, area, type, title, content, tags, author, status
       FROM memory_entry_revisions
       WHERE entry_id = $1 AND revision = $2`,
      [input.entry_id, input.revision],
    )
    if (revision.rows.length === 0) {
      throw new Error(`Revision not found: ${input.entry_id}#${input.revision}`)
    }

    const snapshot = await client.query<{ revision: number }>(
      `INSERT INTO memory_entry_revisions
         (entry_id, revision, area, type, title, content, tags, author, status, embedding,
          embedding_model, embedding_dimensions, embedding_version, embedding_generated_at)
       SELECT memory_entries.id, COALESCE(MAX(memory_entry_revisions.revision), 0) + 1,
              memory_entries.area, memory_entries.type, memory_entries.title,
              memory_entries.content, memory_entries.tags, memory_entries.author,
              memory_entries.status, memory_entries.embedding, memory_entries.embedding_model,
              memory_entries.embedding_dimensions, memory_entries.embedding_version,
              memory_entries.embedding_generated_at
       FROM memory_entries
       LEFT JOIN memory_entry_revisions ON memory_entry_revisions.entry_id = memory_entries.id
       WHERE memory_entries.id = $1
       GROUP BY memory_entries.id, memory_entries.area, memory_entries.type,
                memory_entries.title, memory_entries.content, memory_entries.tags,
                memory_entries.author, memory_entries.status, memory_entries.embedding,
                memory_entries.embedding_model, memory_entries.embedding_dimensions,
                memory_entries.embedding_version, memory_entries.embedding_generated_at
       RETURNING revision`,
      [input.entry_id],
    )
    const snapshotRevision = snapshot.rows[0]?.revision
    if (!snapshotRevision) throw new Error('Could not snapshot current entry before restore')

    const restored = await client.query<MemoryEntry>(
      `UPDATE memory_entries
       SET area = $1, type = $2, title = $3, content = $4, tags = $5,
           author = $6, status = $7, embedding = $8::vector,
           embedding_model = $9, embedding_dimensions = $10,
           embedding_version = $11, embedding_generated_at = now()
       WHERE id = $12
       RETURNING *`,
      [
        target.area,
        target.type,
        target.title,
        target.content,
        target.tags,
        target.author,
        target.status,
        embeddingStr,
        profile.model,
        profile.dimensions,
        profile.version,
        input.entry_id,
      ],
    )
    const entry = restored.rows[0]
    if (!entry) throw new Error('Restore failed — no row returned')

    return {
      entry,
      restored_revision: input.revision,
      snapshot_revision: snapshotRevision,
    }
  })
}
