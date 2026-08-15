import { z }               from 'zod'
import { query, queryOne } from '../db/client.js'
import type { MemoryEntry } from '../types/index.js'

export const DeleteMemorySchema = z.object({
  entry_id: z.string().uuid().describe('ID of the entry to permanently delete'),
  confirm:  z.literal(true).describe('Must be explicitly true. Prevents accidental deletions.'),
})

export type DeleteMemoryInput = z.infer<typeof DeleteMemorySchema>

export async function deleteMemory(input: DeleteMemoryInput) {
  const entry = await queryOne<MemoryEntry>('SELECT id, title, type FROM memory_entries WHERE id = $1', [input.entry_id])
  if (!entry) throw new Error(`Entry not found: ${input.entry_id}`)
  await query('DELETE FROM memory_access_log WHERE entry_id = $1', [input.entry_id])
  await query('DELETE FROM memory_entries WHERE id = $1', [input.entry_id])
  return { deleted: true, entry_id: input.entry_id, title: entry.title, type: entry.type }
}
