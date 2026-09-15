export interface RankedId {
  id: string
  rank: number
}

export const RRF_K = 60

export function getFtsLanguage(): 'simple' | 'english' | 'spanish' {
  const language = process.env.FTS_LANGUAGE
  return language === 'english' || language === 'spanish' ? language : 'simple'
}

export function combineRrf(
  vectorResults: RankedId[],
  ftsResults: RankedId[],
  k = RRF_K,
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const row of [...vectorResults, ...ftsResults]) {
    scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (k + Number(row.rank)))
  }
  return scores
}

export function selectRankedIds(
  scores: Map<string, number>,
  limit: number,
  minScore = 0,
): string[] {
  return [...scores.entries()]
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}
