import test from 'node:test'
import assert from 'node:assert/strict'
import { averageMetrics, evaluateRanking } from '../src/tools/evaluation.js'

test('evaluateRanking computes precision, recall and reciprocal rank', () => {
  assert.deepEqual(
    evaluateRanking(['a', 'b'], ['x', 'b', 'a']),
    { precision: 2 / 3, recall: 1, mrr: 1 / 2 },
  )
})

test('evaluateRanking handles empty and duplicate retrieved ids', () => {
  assert.deepEqual(
    evaluateRanking(['a'], ['a', 'a', 'x']),
    { precision: 1 / 3, recall: 1, mrr: 1 },
  )
  assert.deepEqual(evaluateRanking([], []), { precision: 0, recall: 0, mrr: 0 })
})

test('averageMetrics returns macro averages', () => {
  assert.deepEqual(
    averageMetrics([
      { precision: 1, recall: 0.5, mrr: 1 },
      { precision: 0, recall: 1, mrr: 0.5 },
    ]),
    { precision: 0.5, recall: 0.75, mrr: 0.75 },
  )
})
