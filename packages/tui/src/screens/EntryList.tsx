import React                              from 'react'
import { Box, Text, useInput }            from 'ink'
import SelectInput                        from 'ink-select-input'
import { apiGetContext }                  from '../client.js'
import { TypeBadge, AreaBadge }           from '../components/Badges.js'
import { LoadingPanel, ErrorPanel }       from '../components/Spinner.js'
import { StatusBar }                      from '../components/StatusBar.js'
import type { MemoryEntry, Area, EntryType, Screen } from '../types.js'

const AREAS = [
  { label:'Todas las áreas', value:'' },
  { label:'frontend',        value:'frontend' },
  { label:'backend',         value:'backend' },
  { label:'infra',           value:'infra' },
  { label:'general',         value:'general' },
]
const TYPES = [
  { label:'Todos los tipos', value:'' },
  ...(['BUG','FIX','DECISION','INSIGHT','PATTERN','ANTI_PATTERN','REPOSITORY_NOTE','TASK_CONTEXT','SUMMARY']
      .map(t => ({ label: t, value: t }))),
]

interface Props {
  url: string; project: string
  onNavigate: (s: Screen) => void
  onSelectEntry: (e: MemoryEntry) => void
}
type Mode = 'list' | 'filter-area' | 'filter-type'
const PAGE = 15

export function EntryList({ url, project, onNavigate, onSelectEntry }: Props) {
  const [entries, setEntries]   = React.useState<MemoryEntry[]>([])
  const [loading, setLoad]      = React.useState(true)
  const [error, setError]       = React.useState<string | null>(null)
  const [cursor, setCursor]     = React.useState(0)
  const [offset, setOffset]     = React.useState(0)
  const [filterArea, setArea]   = React.useState<Area | ''>('')
  const [filterType, setType]   = React.useState<EntryType | ''>('')
  const [mode, setMode]         = React.useState<Mode>('list')

  const load = React.useCallback(() => {
    setLoad(true); setError(null)
    apiGetContext(url, project, filterArea || undefined)
      .then(({ priority_entries, entries: rest }) => {
        let all = [...priority_entries, ...rest]
        if (filterType) all = all.filter(e => e.type === filterType)
        setEntries(all); setCursor(0); setOffset(0); setLoad(false)
      })
      .catch(e => { setError((e as Error).message); setLoad(false) })
  }, [url, project, filterArea, filterType])

  React.useEffect(() => { load() }, [load])

  useInput((input, key) => {
    if (mode !== 'list') return
    if (key.upArrow)   { setCursor(c => Math.max(0, c-1)); if (cursor-1 < offset) setOffset(o => Math.max(0, o-1)) }
    if (key.downArrow) { setCursor(c => Math.min(entries.length-1, c+1)); if (cursor+1 >= offset+PAGE) setOffset(o => o+1) }
    if (key.return && entries[cursor]) onSelectEntry(entries[cursor])
    if (input === 'a') setMode('filter-area')
    if (input === 't') setMode('filter-type')
    if (input === 'r') load()
    if (input === 's') onNavigate('search')
    if (key.escape)    onNavigate('dashboard')
    if (input === 'q') process.exit(0)
  })

  if (loading) return <LoadingPanel label="Cargando entradas..." />
  if (error)   return <ErrorPanel message={error} />

  if (mode === 'filter-area') return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Filtrar por área:</Text>
      <SelectInput items={AREAS} onSelect={item => { setArea(item.value as Area | ''); setMode('list') }} />
    </Box>
  )
  if (mode === 'filter-type') return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Filtrar por tipo:</Text>
      <SelectInput items={TYPES} onSelect={item => { setType(item.value as EntryType | ''); setMode('list') }} />
    </Box>
  )

  const visible = entries.slice(offset, offset + PAGE)
  return (
    <Box flexDirection="column">
      <Box paddingX={1} gap={2}>
        <Text dimColor>{entries.length} entradas</Text>
        {filterArea && <Text color="cyan">área:{filterArea}</Text>}
        {filterType && <Text color="yellow">tipo:{filterType}</Text>}
        <Text dimColor>{cursor+1}/{entries.length}</Text>
      </Box>
      <Box flexDirection="column">
        {visible.map((entry, i) => {
          const idx = offset + i
          const sel = idx === cursor
          return (
            <Box key={entry.id} paddingX={1} gap={1}>
              {sel ? <Text color="cyan">▶</Text> : <Text>  </Text>}
              <TypeBadge type={entry.type} />
              <AreaBadge area={entry.area} />
              <Text bold={sel} wrap="truncate-end">{entry.title}</Text>
              <Text dimColor>{String(entry.access_count).padStart(3)}</Text>
            </Box>
          )
        })}
      </Box>
      {entries.length === 0 && <Box paddingX={2} paddingY={1}><Text dimColor>No hay entradas.</Text></Box>}
      <StatusBar keys={[
        {key:'↑↓', label:'Navegar'}, {key:'Enter', label:'Ver'},
        {key:'a',   label:'Área'},   {key:'t', label:'Tipo'},
        {key:'s',   label:'Buscar'}, {key:'r', label:'Refresh'},
        {key:'Esc', label:'Volver'},
      ]} />
    </Box>
  )
}
