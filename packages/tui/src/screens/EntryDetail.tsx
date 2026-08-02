import React                   from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput               from 'ink-text-input'
import SelectInput             from 'ink-select-input'
import { apiUpdateMemory }     from '../client.js'
import { TypeBadge, AreaBadge, StatusBadge } from '../components/Badges.js'
import { Spinner }             from '../components/Spinner.js'
import { StatusBar }           from '../components/StatusBar.js'
import type { MemoryEntry, Status, Screen } from '../types.js'

interface Props { entry: MemoryEntry; onNavigate: (s: Screen) => void; onBack: () => void; url: string }
type Mode = 'view' | 'edit-append' | 'edit-tags' | 'edit-status' | 'saving'

const STATUS_OPTS = [
  { label:'● active',        value:'active'        },
  { label:'○ deprecated',    value:'deprecated'    },
  { label:'◐ review_needed', value:'review_needed' },
]

export function EntryDetail({ entry: init, onBack, url }: Props) {
  const [entry, setEntry]     = React.useState(init)
  const [mode, setMode]       = React.useState<Mode>('view')
  const [appendText, setApp]  = React.useState('')
  const [tagsText, setTags]   = React.useState('')
  const [message, setMsg]     = React.useState<string | null>(null)
  const [error, setErr]       = React.useState<string | null>(null)
  const [scrollY, setScroll]  = React.useState(0)

  const LINES = entry.content.split('\n')
  const VISIBLE = 12
  const visible = LINES.slice(scrollY, scrollY + VISIBLE)

  const save = async (args: Omit<Parameters<typeof apiUpdateMemory>[1], 'entry_id'>) => {
    setMode('saving'); setErr(null)
    try {
      const updated = await apiUpdateMemory(url, { entry_id: entry.id, ...args })
      setEntry(updated); setMsg('Guardado'); setMode('view')
      setTimeout(() => setMsg(null), 1500)
    } catch(e) { setErr((e as Error).message); setMode('view') }
  }

  useInput((input, key) => {
    if (mode === 'view') {
      if (key.upArrow)   setScroll(s => Math.max(0, s-1))
      if (key.downArrow) setScroll(s => Math.min(Math.max(0, LINES.length - VISIBLE), s+1))
      if (input === 'a') { setApp(''); setMode('edit-append') }
      if (input === 't') { setTags(''); setMode('edit-tags') }
      if (input === 's') setMode('edit-status')
      if (key.escape || input === 'b') onBack()
      if (input === 'q') process.exit(0)
    }
    if ((mode === 'edit-append' || mode === 'edit-tags') && key.escape) setMode('view')
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Box gap={2} justifyContent="space-between">
          <Box gap={1}><TypeBadge type={entry.type} /><AreaBadge area={entry.area} /><StatusBadge status={entry.status} /></Box>
          <Text dimColor>{entry.access_count} acc</Text>
        </Box>
        <Text bold>{entry.title}</Text>
        <Box gap={2}>
          <Text dimColor>por {entry.author}</Text>
          <Text dimColor>{new Date(entry.updated_at).toLocaleDateString('es')}</Text>
          {entry.tags.length > 0 && <Text color="blue" dimColor>#{entry.tags.join(' #')}</Text>}
        </Box>
      </Box>

      {mode === 'view' && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Box justifyContent="space-between">
            <Text dimColor>Contenido</Text>
            {LINES.length > VISIBLE && (
              <Text dimColor>{scrollY+1}-{Math.min(scrollY+VISIBLE, LINES.length)}/{LINES.length} ↑↓</Text>
            )}
          </Box>
          {visible.map((line, i) => <Text key={i} wrap="truncate-end">{line || ' '}</Text>)}
        </Box>
      )}

      {mode === 'edit-append' && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} gap={1}>
          <Text bold color="cyan">Agregar al contenido</Text>
          <TextInput value={appendText} onChange={setApp}
            onSubmit={v => { if (v.trim()) save({ append_content: v.trim() }) }}
            placeholder="Texto a agregar... (Enter para guardar)" />
        </Box>
      )}

      {mode === 'edit-tags' && (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} gap={1}>
          <Text bold color="yellow">Agregar tags</Text>
          <Text dimColor>Actuales: {entry.tags.length > 0 ? `#${entry.tags.join(' #')}` : '(ninguno)'}</Text>
          <TextInput value={tagsText} onChange={setTags}
            onSubmit={v => { if (v.trim()) save({ add_tags: v.split(/[\s,]+/).filter(Boolean) }) }}
            placeholder="tag1 tag2 (Enter para guardar)" />
        </Box>
      )}

      {mode === 'edit-status' && (
        <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} gap={1}>
          <Text bold color="magenta">Cambiar estado</Text>
          <SelectInput items={STATUS_OPTS} onSelect={item => save({ status: item.value as Status })} />
        </Box>
      )}

      {mode === 'saving' && <Spinner label="Guardando..." />}

      <StatusBar
        keys={mode === 'view'
          ? [{key:'↑↓',label:'Scroll'},{key:'a',label:'Agregar texto'},{key:'t',label:'Tags'},{key:'s',label:'Estado'},{key:'Esc',label:'Volver'}]
          : [{key:'Enter',label:'Guardar'},{key:'Esc',label:'Cancelar'}]
        }
        message={message ?? undefined}
        error={error ?? undefined}
      />
    </Box>
  )
}
