export interface EvaluationCase {
  id: string
  query: string
  type?: string
  relevant_ids: string[]
}

export interface EvaluationMetrics {
  precision: number
  recall: number
  mrr: number
}

export function evaluateRanking(
  relevantIds: readonly string[],
  retrievedIds: readonly string[],
): EvaluationMetrics {
  const relevant = new Set(relevantIds)
  const retrieved = retrievedIds.slice()
  const hits = retrieved.filter((id, index) => retrieved.indexOf(id) === index && relevant.has(id))
  const firstRelevantRank = retrieved.findIndex((id) => relevant.has(id))

  return {
    precision: retrieved.length === 0 ? 0 : hits.length / retrieved.length,
    recall: relevant.size === 0 ? 0 : hits.length / relevant.size,
    mrr: firstRelevantRank === -1 ? 0 : 1 / (firstRelevantRank + 1),
  }
}

export function averageMetrics(metrics: readonly EvaluationMetrics[]): EvaluationMetrics {
  if (metrics.length === 0) return { precision: 0, recall: 0, mrr: 0 }
  return metrics.reduce(
    (total, current) => ({
      precision: total.precision + current.precision / metrics.length,
      recall: total.recall + current.recall / metrics.length,
      mrr: total.mrr + current.mrr / metrics.length,
    }),
    { precision: 0, recall: 0, mrr: 0 },
  )
}
