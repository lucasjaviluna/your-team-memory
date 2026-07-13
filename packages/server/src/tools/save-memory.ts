import { z } from 'zod'
import { query, queryOne } from '../db/client.js'
import { generateEmbedding, buildEmbeddingText } from '../embeddings/ollama.js'
import { findNearDuplicate } from './find-near-duplicate.js'
import type { MemoryEntry, Project, SaveMemoryResult } from '../types/index.js'

export const SaveMemorySchema = z.object({
  project_slug: z.string().describe('Project identifier slug (e.g. "ecommerce-app")'),
  area: z.enum(['frontend', 'backend', 'infra', 'general']),
  type: z.enum([
    'BUG',
    'FIX',
    'DECISION',
    'INSIGHT',
    'PATTERN',
    'ANTI_PATTERN',
    'REPOSITORY_NOTE',
    'TASK_CONTEXT',
    'SUMMARY',
  ]).describe(`
    BUG            → Documented problem with context of how it manifested
    FIX            → Solution applied, with or without an associated bug
    DECISION       → Technical or product choice with reasoning
    INSIGHT        → Non-obvious learning or discovery during work
    PATTERN        → Proven reusable solution in this project
    ANTI_PATTERN   → What not to do and why
    REPOSITORY_NOTE→ Structural knowledge about the repo (folders, files, conventions)
    TASK_CONTEXT   → Work in progress context (e.g. "React 19 migration is pending")
    SUMMARY        → End-of-session compaction, loaded first in every new session
  `),
  title: z.string().min(3).describe('Short descriptive title for this memory entry'),
  content: z.string().min(10).describe('Full content of the memory entry'),
  tags: z.array(z.string()).optional().default([]),
  author: z.string().describe('Dev username or identifier'),
  force: z.boolean().optional().default(false).describe(
    'Skip duplicate check and insert regardless. Use only when the agent has confirmed ' +
    'the new entry is genuinely different from the near-duplicate returned in a previous call.'
  ),
})

export type SaveMemoryInput = z.infer<typeof SaveMemorySchema>

export async function saveMemory(input: SaveMemoryInput): Promise<SaveMemoryResult> {
  // 1. Resolver el proyecto (o crearlo si no existe)
  let project = await queryOne<Project>(
    'SELECT * FROM projects WHERE slug = $1',
    [input.project_slug]
  )

  if (!project) {
    project = await queryOne<Project>(
      `INSERT INTO projects (slug, name) VALUES ($1, $2) RETURNING *`,
      [input.project_slug, input.project_slug]
    )
  }
  if (!project) throw new Error(`Could not resolve project: ${input.project_slug}`)

  // 2. Deduplicación — solo si force: false (default)
  if (!input.force) {
    const duplicate = await findNearDuplicate({
      project_id: project.id,
      area:       input.area,
      type:       input.type,
      title:      input.title,
      content:    input.content,
      tags:       input.tags,
    })

    if (duplicate) {
      const isExactTitle = duplicate.score === 1.0
      return {
        saved:     false,
        duplicate,
        suggestion: isExactTitle
          ? `An entry with the exact same title already exists (id: ${duplicate.id}). ` +
            `Use update_memory to extend it, or save_memory with force: true if this is intentionally a separate entry.`
          : `A semantically very similar entry was found (id: ${duplicate.id}, score: ${duplicate.score.toFixed(4)}). ` +
            `Review it and use update_memory to extend it if it covers the same topic, ` +
            `or save_memory with force: true if this entry is genuinely different.`,
      }
    }
  }

  // 3. Generar embedding
  const embeddingText = buildEmbeddingText(input.title, input.content, input.tags)
  const embedding     = await generateEmbedding(embeddingText)
  const embeddingStr  = `[${embedding.join(',')}]`

  // 4. Insertar
  const entry = await queryOne<MemoryEntry>(
    `INSERT INTO memory_entries
       (project_id, area, type, title, content, tags, author, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
     RETURNING *`,
    [project.id, input.area, input.type, input.title, input.content, input.tags, input.author, embeddingStr]
  )

  if (!entry) throw new Error('Failed to insert memory entry')

  return { saved: true, entry }
}
