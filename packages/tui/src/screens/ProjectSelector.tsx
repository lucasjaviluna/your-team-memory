import React                   from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput             from 'ink-select-input'
import { apiListProjects }     from '../client.js'
import { LoadingPanel, ErrorPanel } from '../components/Spinner.js'
import type { Project }        from '../types.js'

interface Props {
  url:       string
  onSelect:  (slug: string) => void
}

export function ProjectSelector({ url, onSelect }: Props) {
  const [projects, setProjects] = React.useState<Project[]>([])
  const [loading, setLoading]   = React.useState(true)
  const [error, setError]       = React.useState<string | null>(null)

  React.useEffect(() => {
    apiListProjects(url)
      .then(list => { setProjects(list); setLoading(false) })
      .catch(e  => { setError((e as Error).message); setLoading(false) })
  }, [url])

  useInput((input) => {
    if (input === 'q') process.exit(0)
  })

  if (loading) return <LoadingPanel label="Cargando proyectos disponibles..." />
  if (error)   return <ErrorPanel message={error} hint="Verificá que el servidor esté corriendo." />

  if (projects.length === 0) {
    return (
      <Box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
        <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
          <Text color="yellow">⚠ No hay proyectos con memoria todavía.</Text>
        </Box>
        <Text dimColor>
          Para comenzar, agregá <Text color="cyan">.team-memory.json</Text> al root de tu repo:
        </Text>
        <Box borderStyle="single" borderColor="gray" paddingX={2} paddingY={1}>
          <Text color="gray">{`{\n  "project_slug": "nombre-del-proyecto"\n}`}</Text>
        </Box>
        <Text dimColor>O pasá el proyecto directamente:</Text>
        <Text color="cyan">  memory-tui --project=nombre-del-proyecto</Text>
        <Box marginTop={1}><Text dimColor>Presioná <Text bold>q</Text> para salir.</Text></Box>
      </Box>
    )
  }

  const items = projects.map(p => ({
    label: `${p.slug.padEnd(32)} ${String(p.total_entries ?? 0).padStart(4)} entradas`,
    value: p.slug,
  }))

  return (
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0}>
        <Text bold color="cyan">
          Seleccioná un proyecto  <Text dimColor>({projects.length} disponibles)</Text>
        </Text>
      </Box>

      <Box paddingX={1}>
        <Text dimColor>
          No encontré <Text color="cyan">.team-memory.json</Text> en el directorio actual.
          {'\n'}  Elegí un proyecto de la lista o usá <Text color="cyan">memory-tui --project=slug</Text>
        </Text>
      </Box>

      <SelectInput
        items={items}
        onSelect={item => onSelect(item.value)}
      />

      <Box marginTop={1}>
        <Text dimColor>
          Para no ver este selector, agregá <Text color="cyan">.team-memory.json</Text> al root del repo.
        </Text>
      </Box>
    </Box>
  )
}
