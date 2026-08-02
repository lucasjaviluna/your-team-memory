import React                   from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput             from 'ink-select-input'
import { apiCompactMemory }    from '../client.js'
import { LoadingPanel, ErrorPanel } from '../components/Spinner.js'
import { StatusBar }           from '../components/StatusBar.js'
import type { CompactResult, Screen } from '../types.js'

interface Props { url: string; project: string; onNavigate: (s: Screen) => void }
type Mode = 'loading-preview' | 'preview' | 'confirm' | 'running' | 'done' | 'error'

const PARAMS = { older_than_days: 90, max_access_count: 5, last_accessed_days: 30 }

export function Compact({ url, project, onNavigate }: Props) {
  const [mode, setMode]     = React.useState<Mode>('loading-preview')
  const [preview, setPreview] = React.useState<CompactResult | null>(null)
  const [result, setResult]   = React.useState<CompactResult | null>(null)
  const [error, setError]     = React.useState<string | null>(null)

  React.useEffect(() => {
    apiCompactMemory(url, { project_slug: project, dry_run: true, ...PARAMS })
      .then(r => { setPreview(r); setMode('preview') })
      .catch(e => { setError((e as Error).message); setMode('error') })
  }, [url, project])

  const runReal = () => {
    setMode('running')
    apiCompactMemory(url, { project_slug: project, dry_run: false, ...PARAMS })
      .then(r => { setResult(r); setMode('done') })
      .catch(e => { setError((e as Error).message); setMode('error') })
  }

  useInput((_, key) => {
    if (key.escape && (mode === 'preview' || mode === 'done' || mode === 'error'))
      onNavigate('dashboard')
  })

  if (mode === 'loading-preview') return <LoadingPanel label="Analizando candidatos..." />
  if (mode === 'running')         return <LoadingPanel label="Compactando... esto puede tardar." />
  if (mode === 'error')           return <ErrorPanel message={error!} hint="Presioná Esc para volver." />

  if (mode === 'done' && result) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round" borderColor="green" paddingX={2} paddingY={1} flexDirection="column" gap={1}>
          <Text bold color="green">✓ Compactación completada</Text>
          <Box gap={4}>
            <Box flexDirection="column" alignItems="center">
              <Text bold color="cyan">{result.summaries_created}</Text>
              <Text dimColor>SUMMARYs creados</Text>
            </Box>
            <Box flexDirection="column" alignItems="center">
              <Text bold color="yellow">{result.entries_archived}</Text>
              <Text dimColor>entradas archivadas</Text>
            </Box>
          </Box>
        </Box>
        <StatusBar keys={[{key:'Esc', label:'Volver'}]} message="Compactación exitosa" />
      </Box>
    )
  }

  if (mode === 'confirm') {
    return (
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1} flexDirection="column" gap={1}>
          <Text bold color="red">⚠ Confirmación requerida</Text>
          <Text>Archivar <Text bold color="yellow">{preview?.entries_archived}</Text> entradas
            y crear <Text bold color="cyan">{preview?.summaries_created}</Text> SUMMARYs.</Text>
          <Text dimColor>Las originales quedan archivadas — no se eliminan.</Text>
        </Box>
        <SelectInput
          items={[
            { label:'✓ Confirmar — ejecutar compactación real', value:'yes' },
            { label:'✗ Cancelar — volver al preview',           value:'no'  },
          ]}
          onSelect={item => item.value === 'yes' ? runReal() : setMode('preview')}
        />
      </Box>
    )
  }

  // preview
  if (!preview) return null
  const none = preview.candidates_found === 0

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>Criterios</Text>
        <Box gap={3}>
          <Text dimColor>No actualizada en <Text color="yellow">{PARAMS.older_than_days}d</Text></Text>
          <Text dimColor>Accesos &lt; <Text color="yellow">{PARAMS.max_access_count}</Text></Text>
          <Text dimColor>Sin uso en <Text color="yellow">{PARAMS.last_accessed_days}d</Text></Text>
        </Box>
        <Text dimColor>SUMMARY y TASK_CONTEXT excluidos</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={none ? 'green' : 'yellow'} paddingX={1}>
        <Text bold>Análisis (dry run)</Text>
        <Box gap={4}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color={none ? 'green' : 'yellow'}>{preview.candidates_found}</Text>
            <Text dimColor>candidatos</Text>
          </Box>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="cyan">{preview.summaries_created}</Text>
            <Text dimColor>SUMMARYs</Text>
          </Box>
          <Box flexDirection="column" alignItems="center">
            <Text bold color="yellow">{preview.entries_archived}</Text>
            <Text dimColor>a archivar</Text>
          </Box>
        </Box>
        {none && <Text color="green">✓ Sin candidatos — el proyecto está saludable.</Text>}
      </Box>

      {preview.summaries && preview.summaries.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text bold>Grupos</Text>
          {preview.summaries.map((s, i) => (
            <Box key={i} gap={2}>
              <Text dimColor>{String(i+1).padStart(2)}.</Text>
              <Text color="cyan">[{s.type}]</Text>
              <Text color="blue">{s.area}</Text>
              <Text color="yellow">{s.entries_archived} entradas</Text>
              <Text dimColor>→ 1 SUMMARY</Text>
            </Box>
          ))}
        </Box>
      )}

      <StatusBar keys={none
        ? [{key:'Esc', label:'Volver'}]
        : [{key:'Enter', label:'Ejecutar'}, {key:'Esc', label:'Volver'}]
      } />

      {!none && (
        <SelectInput
          items={[{ label:'→ Ejecutar compactación real', value:'go' }]}
          onSelect={() => setMode('confirm')}
        />
      )}
    </Box>
  )
}
