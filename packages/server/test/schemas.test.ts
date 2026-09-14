import assert from 'node:assert/strict'
import test from 'node:test'

// Importing schemas also creates the DB pool, but does not connect to it.
process.env.DB_USER ??= 'test'
process.env.DB_PASSWORD ??= 'test'
process.env.DB_NAME ??= 'test'

const { SaveMemorySchema } = await import('../src/tools/save-memory.js')
const { UpdateMemorySchema } = await import('../src/tools/update-memory.js')
const { SearchMemorySchema } = await import('../src/tools/search-memory.js')

test('save_memory accepts a valid bounded entry', () => {
  const result = SaveMemorySchema.safeParse({
    project_slug: 'demo-project',
    area: 'general',
    type: 'DECISION',
    title: 'Use PostgreSQL',
    content: 'Persist structured team knowledge in PostgreSQL.',
    tags: ['storage'],
    author: 'tester',
  })
  assert.equal(result.success, true)
})

test('schemas reject oversized or empty user-controlled fields', () => {
  assert.equal(SaveMemorySchema.safeParse({
    project_slug: 'demo', area: 'general', type: 'INSIGHT',
    title: 'ok', content: 'x'.repeat(100_001), author: 'tester',
  }).success, false)

  assert.equal(SearchMemorySchema.safeParse({ query: 'x'.repeat(2_001) }).success, false)
  assert.equal(UpdateMemorySchema.safeParse({ entry_id: 'not-a-uuid', title: 'x' }).success, false)
})

test('update schema preserves mutually exclusive operations for the service layer', () => {
  // The schema preserves both fields for a domain-level error; this test documents
  // that the service must continue enforcing the mutual exclusion explicitly.
  const result = UpdateMemorySchema.safeParse({
    entry_id: '00000000-0000-0000-0000-000000000000',
    content: 'replacement content',
    append_content: 'additional content',
  })
  assert.equal(result.success, true)
})
