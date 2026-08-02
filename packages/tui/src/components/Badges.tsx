import React   from 'react'
import { Text } from 'ink'
import type { EntryType, Area, Status } from '../types.js'
const TC: Record<EntryType,string> = {
  SUMMARY:'red', TASK_CONTEXT:'magenta', DECISION:'blue', REPOSITORY_NOTE:'gray',
  PATTERN:'cyan', ANTI_PATTERN:'red', INSIGHT:'yellow', FIX:'green', BUG:'white',
}
const AC: Record<Area,string>   = { frontend:'cyan', backend:'green', infra:'yellow', general:'gray' }
const SC: Record<Status,string> = { active:'green', deprecated:'yellow', review_needed:'magenta', archived:'gray' }
export function TypeBadge({ type }: { type: EntryType }) {
  return <Text color={TC[type] ?? 'white'} bold>[{type.replace('_',' ').substring(0,10).padEnd(10)}]</Text>
}
export function AreaBadge({ area }: { area: Area }) {
  return <Text color={AC[area] ?? 'white'}>{area.padEnd(8)}</Text>
}
export function StatusBadge({ status }: { status: Status }) {
  const labels: Record<Status,string> = {
    active:'● active', deprecated:'○ deprecated', review_needed:'◐ review', archived:'○ archived'
  }
  return <Text color={SC[status] ?? 'white'}>{labels[status]}</Text>
}
export function ScoreBadge({ score }: { score: number }) {
  const pct = Math.min(100, Math.round((score / 0.033) * 100))
  return <Text color={pct > 75 ? 'green' : pct > 40 ? 'yellow' : 'gray'}>{score.toFixed(4)}</Text>
}
