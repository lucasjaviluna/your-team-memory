import React                       from 'react'
import { Box, Text, useInput }      from 'ink'
import { apiGetStats }              from '../client.js'
import { LoadingPanel, ErrorPanel } from '../components/Spinner.js'
import { StatusBar }                from '../components/StatusBar.js'
import type { MemoryStats, Screen } from '../types.js'

interface Props { url: string; project: string; onNavigate: (s: Screen) => void }

export function Dashboard({ url, project, onNavigate }: Props) {
  const [stats, setStats]   = React.useState<MemoryStats | null>(null)
  const [error, setError]   = React.useState<string | null>(null)
  const [loading, setLoad]  = React.useState(true)

  React.useEffect(() => {
    setLoad(true)
    apiGetStats(url, project)
      .then(s => { setStats(s); setLoad(false) })
      .catch(e => { setError((e as Error).message); setLoad(false) })
  }, [url, project])

  useInput(input => {
    if (input === 'l') onNavigate('list')
    if (input === 's') onNavigate('search')
    if (input === 'c') onNavigate('compact')
    if (input === 'q') process.exit(0)
  })

  if (loading) return <LoadingPanel label={`Cargando stats de ${project}...`} />
  if (error)   return <ErrorPanel message={error} hint="Verificá que el servidor esté accesible." />
  if (!stats)  return null

  const { overview, access, health } = stats
  const totalActive = overview.by_status.find(s => s.status === 'active')?.count ?? 0

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2} flexWrap="wrap">
        {[
          ['Total',    String(overview.total_entries),                  'cyan'],
          ['Activas',  String(totalActive),                             'green'],
          ['Accesos',  String(access.total_accesses_in_window),         'blue'],
          ['Sin acceso', String(access.never_accessed_count),           'yellow'],
          ['Compact',  String(health.compaction_candidates_count),      'red'],
          ['Dup risk', String(health.duplicate_risk_count),             'magenta'],
        ].map(([label, value, color]) => (
          <Box key={label} flexDirection="column" alignItems="center"
               borderStyle="round" borderColor="gray" paddingX={2} minWidth={14}>
            <Text bold color={color}>{value}</Text>
            <Text dimColor>{label}</Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>Por tipo</Text>
        <Box gap={3} flexWrap="wrap" marginTop={1}>
          {overview.by_type.map(t => (
            <Box key={t.type} flexDirection="column" alignItems="center">
              <Text bold color="cyan">{t.count}</Text>
              <Text dimColor>{t.type.replace('_',' ')}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      {access.top_accessed.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>Más consultadas (30d)</Text>
          {access.top_accessed.slice(0, 5).map((e, i) => (
            <Box key={e.id} gap={2}>
              <Text dimColor>{String(i+1).padStart(2)}.</Text>
              <Text color="blue">{String(e.access_count).padStart(3)}acc</Text>
              <Text dimColor>[{e.type}]</Text>
              <Text wrap="truncate-end">{e.title.slice(0, 60)}</Text>
            </Box>
          ))}
        </Box>
      )}

      <StatusBar keys={[
        {key:'l', label:'Entradas'}, {key:'s', label:'Buscar'},
        {key:'c', label:'Compactar'}, {key:'q', label:'Salir'},
      ]} />
    </Box>
  )
}
