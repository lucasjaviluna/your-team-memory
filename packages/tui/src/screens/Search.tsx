import React                              from 'react'
import { Box, Text, useInput }            from 'ink'
import TextInput                          from 'ink-text-input'
import { apiSearchMemory }                from '../client.js'
import { TypeBadge, AreaBadge, ScoreBadge } from '../components/Badges.js'
import { LoadingPanel, ErrorPanel }       from '../components/Spinner.js'
import { StatusBar }                      from '../components/StatusBar.js'
import type { MemoryEntry, Screen }       from '../types.js'

interface Props {
  url: string; project: string
  onNavigate: (s: Screen) => void
  onSelectEntry: (e: MemoryEntry) => void
}
type Mode = 'input' | 'results'

export function Search({ url, project, onNavigate, onSelectEntry }: Props) {
  const [query, setQuery]     = React.useState('')
  const [results, setResults] = React.useState<MemoryEntry[]>([])
  const [loading, setLoad]    = React.useState(false)
  const [error, setError]     = React.useState<string | null>(null)
  const [cursor, setCursor]   = React.useState(0)
  const [mode, setMode]       = React.useState<Mode>('input')
  const [searched, setSearch] = React.useState(false)

  const run = React.useCallback((q: string) => {
    if (!q.trim()) return
    setLoad(true); setError(null); setSearch(true)
    apiSearchMemory(url, { query: q, project_slug: project, limit: 20 })
      .then(arr => { setResults(arr); setCursor(0); setMode('results'); setLoad(false) })
      .catch(e => { setError((e as Error).message); setLoad(false) })
  }, [url, project])

  useInput((input, key) => {
    if (mode === 'input') {
      if (key.return && query.trim()) run(query)
      if (key.escape) onNavigate('dashboard')
      return
    }
    if (key.upArrow)   setCursor(c => Math.max(0, c-1))
    if (key.downArrow) setCursor(c => Math.min(results.length-1, c+1))
    if (key.return && results[cursor]) onSelectEntry(results[cursor])
    if (key.escape || input === 'n') { setMode('input'); setResults([]); setSearch(false) }
    if (input === 'q') process.exit(0)
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="round" borderColor={mode === 'input' ? 'cyan' : 'gray'} paddingX={1} gap={1}>
        <Text color="cyan">🔍</Text>
        {mode === 'input'
          ? <TextInput value={query} onChange={setQuery} onSubmit={run} placeholder="Buscar en la memoria del equipo..." />
          : <Text dimColor>{query}</Text>
        }
      </Box>
      {loading && <LoadingPanel label={`Buscando "${query}"...`} />}
      {error   && <ErrorPanel message={error} />}
      {!loading && searched && results.length === 0 && (
        <Box paddingX={2}><Text color="yellow">Sin resultados para "{query}"</Text></Box>
      )}
      {!loading && results.length > 0 && (
        <Box flexDirection="column">
          <Box paddingX={1}><Text dimColor>{results.length} resultado{results.length !== 1 ? 's' : ''}</Text></Box>
          {results.map((entry, i) => {
            const sel = i === cursor && mode === 'results'
            return (
              <Box key={entry.id} flexDirection="column" paddingX={1}>
                <Box gap={1}>
                  {sel ? <Text color="cyan">▶</Text> : <Text>  </Text>}
                  {entry.score !== undefined && <ScoreBadge score={entry.score} />}
                  <TypeBadge type={entry.type} />
                  <AreaBadge area={entry.area} />
                  <Text bold={sel} wrap="truncate-end">{entry.title}</Text>
                </Box>
                {sel && (
                  <Box paddingLeft={3}>
                    <Text dimColor wrap="truncate-end">
                      {entry.content.slice(0, 120)}{entry.content.length > 120 ? '…' : ''}
                    </Text>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}
      <StatusBar keys={
        mode === 'input'
          ? [{key:'Enter', label:'Buscar'}, {key:'Esc', label:'Volver'}]
          : [{key:'↑↓', label:'Navegar'}, {key:'Enter', label:'Ver'}, {key:'n', label:'Nueva búsqueda'}, {key:'Esc', label:'Limpiar'}]
      } />
    </Box>
  )
}
