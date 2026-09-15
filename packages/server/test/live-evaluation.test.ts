import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { averageMetrics, evaluateRanking, type EvaluationCase } from '../src/tools/evaluation.js'

const live = process.env.RUN_LIVE_INTEGRATION === '1'

test('live RAG evaluation corpus produces measurable metrics', { skip: !live }, async () => {
  const { searchMemory } = await import('../src/tools/search-memory.js')
  const corpusUrl = new URL('../../../documentation/evaluation/corpus-v1.json', import.meta.url)
  const corpus = JSON.parse(await readFile(corpusUrl, 'utf8')) as { cases: EvaluationCase[] }
  const metrics = []

  for (const evaluationCase of corpus.cases) {
    const results = await searchMemory({
      query: evaluationCase.query,
      project_slug: 'team-memory',
      type: evaluationCase.type as never,
      limit: 10,
      min_score: 0,
    })
    const current = evaluateRanking(
      evaluationCase.relevant_ids,
      results.map((result) => result.id),
    )
    metrics.push(current)
    assert.ok(Number.isFinite(current.mrr), `${evaluationCase.id}: MRR inválido`)
  }

  const average = averageMetrics(metrics)
  console.log(`RAG corpus-v1 macro: precision=${average.precision.toFixed(3)} recall=${average.recall.toFixed(3)} mrr=${average.mrr.toFixed(3)}`)

  if (process.env.RAG_EVAL_SWEEP === '1') {
    for (const limit of [3, 5, 10]) {
      for (const min_score of [0, 0.005, 0.01, 0.015, 0.016]) {
        const sweepMetrics = []
        for (const evaluationCase of corpus.cases) {
          const results = await searchMemory({
            query: evaluationCase.query,
            project_slug: 'team-memory',
            type: evaluationCase.type as never,
            limit,
            min_score,
          })
          sweepMetrics.push(evaluateRanking(
            evaluationCase.relevant_ids,
            results.map((result) => result.id),
          ))
        }
        const current = averageMetrics(sweepMetrics)
        console.log(`RAG sweep limit=${limit} min_score=${min_score.toFixed(4)}: precision=${current.precision.toFixed(3)} recall=${current.recall.toFixed(3)} mrr=${current.mrr.toFixed(3)}`)
      }
    }
  }
})
