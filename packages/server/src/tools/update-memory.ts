import { z } from 'zod'
import { query, queryOne } from '../db/client.js'
import { generateEmbedding, buildEmbeddingText } from '../embeddings/ollama.js'
import type { MemoryEntry } from '../types/index.js'

export const UpdateMemorySchema = z.object({
  entry_id: z.string().uuid().describe('UUID of the entry to update'),

  content: z.string().min(10).optional()
    .describe('Replace the entire content with this text.'),

  append_content: z.string().min(3).optional()
    .describe('Append this text to the end of the existing content (e.g. adding a warning or updating "last observed"). Mutually exclusive with content.'),

  title: z.string().min(3).optional()
    .describe('Replace the title.'),

  tags: z.array(z.string()).optional()
    .describe('Replace the entire tags array.'),

  add_tags: z.array(z.string()).optional()
    .describe('Add these tags to the existing ones without removing current tags. Mutually exclusive with tags.'),

  status: z.enum(['active', 'deprecated', 'review_needed']).optional()
    .describe('Change the status. Cannot set "archived" directly — that is only set by compact_memory.'),
})

export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>

export async function updateMemory(input: UpdateMemoryInput): Promise<MemoryEntry> {
  const existing = await queryOne<MemoryEntry>(
    'SELECT * FROM memory_entries WHERE id = $1',
    [input.entry_id]
  )

  if (!existing) {
    throw new Error(`Entry not found: ${input.entry_id}`)
  }

  if (existing.status === 'archived') {
    throw new Error(
      `Entry ${input.entry_id} is archived (compacted into a SUMMARY). ` +
      `Archived entries cannot be updated directly — update the SUMMARY instead, ` +
      `or use search_memory to find the current active entry.`
    )
  }

  if (input.content && input.append_content) {
    throw new Error('Provide either content or append_content, not both.')
  }
  if (input.tags && input.add_tags) {
    throw new Error('Provide either tags or add_tags, not both.')
  }

  // Resolver valores finales
  const newTitle = input.title ?? existing.title
  const newContent = input.content
    ? input.content
    : input.append_content
      ? `${existing.content}\n\n${input.append_content}`
      : existing.content
  const newTags = input.tags
    ? input.tags
    : input.add_tags
      ? [...new Set([...existing.tags, ...input.add_tags])]
      : existing.tags
  const newStatus = input.status ?? existing.status

  // Regenerar embedding solo si cambió el contenido relevante
  const contentChanged = newTitle !== existing.title
    || newContent !== existing.content
    || JSON.stringify(newTags) !== JSON.stringify(existing.tags)

  const sets: string[] = ['status = $1']
  const params: unknown[] = [newStatus]

  if (contentChanged) {
    const embeddingText = buildEmbeddingText(newTitle, newContent, newTags)
    const embedding = await generateEmbedding(embeddingText)
    const embeddingStr = `[${embedding.join(',')}]`

    sets.push(`title = $${params.length + 1}`)
    params.push(newTitle)
    sets.push(`content = $${params.length + 1}`)
    params.push(newContent)
    sets.push(`tags = $${params.length + 1}`)
    params.push(newTags)
    sets.push(`embedding = $${params.length + 1}::vector`)
    params.push(embeddingStr)
  }

  params.push(input.entry_id)

  const updated = await queryOne<MemoryEntry>(
    `UPDATE memory_entries
     SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  )

  if (!updated) throw new Error('Update failed — no row returned')

  return updated
}
