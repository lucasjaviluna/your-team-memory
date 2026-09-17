import assert from 'node:assert/strict'
import test from 'node:test'

// Importing schemas also creates the DB pool, but does not connect to it.
process.env.DB_USER ??= 'test'
process.env.DB_PASSWORD ??= 'test'
process.env.DB_NAME ??= 'test'

const { SaveMemorySchema } = await import('../src/tools/save-memory.js')
const { UpdateMemorySchema } = await import('../src/tools/update-memory.js')
const { SearchMemorySchema } = await import('../src/tools/search-memory.js')
const { GetMemoryRevisionsSchema } = await import('../src/tools/get-memory-revisions.js')
const { RestoreMemoryRevisionSchema } = await import('../src/tools/restore-memory-revision.js')
const { RotateTaskContextSchema, shouldRotateTaskContext } = await import('../src/tools/rotate-task-context.js')
const { combineRrf, selectRankedIds } = await import('../src/tools/ranking.js')

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

test('revision schema validates entry id and pagination bounds', () => {
  assert.equal(GetMemoryRevisionsSchema.safeParse({
    entry_id: '00000000-0000-0000-0000-000000000000',
    limit: 50,
    offset: 10,
  }).success, true)
  assert.equal(GetMemoryRevisionsSchema.safeParse({
    entry_id: 'not-a-uuid',
  }).success, false)
  assert.equal(GetMemoryRevisionsSchema.safeParse({
    entry_id: '00000000-0000-0000-0000-000000000000',
    limit: 51,
  }).success, false)
})

test('restore revision schema requires explicit confirmation', () => {
  const base = {
    entry_id: '00000000-0000-0000-0000-000000000000',
    revision: 1,
  }
  assert.equal(RestoreMemoryRevisionSchema.safeParse({ ...base, confirm: true }).success, true)
  assert.equal(RestoreMemoryRevisionSchema.safeParse({ ...base, confirm: false }).success, false)
  assert.equal(RestoreMemoryRevisionSchema.safeParse({ ...base, revision: 0, confirm: true }).success, false)
})

test('task context rotation schema requires confirmation and bounds threshold', () => {
  const base = {
    entry_id: '00000000-0000-0000-0000-000000000000',
    confirm: true,
  }
  assert.equal(RotateTaskContextSchema.safeParse(base).success, true)
  assert.equal(RotateTaskContextSchema.safeParse({ ...base, confirm: false }).success, false)
  assert.equal(RotateTaskContextSchema.safeParse({ ...base, threshold_chars: 999 }).success, false)
  assert.equal(RotateTaskContextSchema.safeParse({ ...base, threshold_chars: 20_000, force: true }).success, true)
})

test('task context rotation policy only rotates above threshold unless forced', () => {
  assert.equal(shouldRotateTaskContext(12_000), false)
  assert.equal(shouldRotateTaskContext(12_001), true)
  assert.equal(shouldRotateTaskContext(100, 12_000, true), true)
  assert.equal(shouldRotateTaskContext(12_001, 20_000), false)
})

test('RRF ranking favors results present in both rankings', () => {
  const scores = combineRrf(
    [{ id: 'vector-only', rank: 1 }, { id: 'both', rank: 2 }],
    [{ id: 'both', rank: 1 }, { id: 'fts-only', rank: 2 }],
  )
  assert.deepEqual(selectRankedIds(scores, 3), ['both', 'vector-only', 'fts-only'])
  assert.deepEqual(selectRankedIds(scores, 3, 0.02), ['both'])
})
