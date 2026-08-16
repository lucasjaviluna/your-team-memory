import React           from 'react'
import { Box, Text }   from 'ink'
import { Header }      from './components/Header.js'
import { Dashboard }   from './screens/Dashboard.js'
import { EntryList }   from './screens/EntryList.js'
import { Search }      from './screens/Search.js'
import { EntryDetail } from './screens/EntryDetail.js'
import { Compact }     from './screens/Compact.js'
import { Admin }       from './screens/Admin.js'
import { ProjectSelector } from './screens/ProjectSelector.js'
import type { MemoryEntry, Screen } from './types.js'

interface Props {
  url:       string
  project:   string | null   // null → mostrar selector interactivo
  apiToken:  string | null
  isAdmin:   boolean
}

export function App({ url, project: initialProject, apiToken, isAdmin }: Props) {
  const [project, setProject]        = React.useState<string | null>(initialProject)
  const [screen, setScreen]          = React.useState<Screen>('dashboard')
  const [selectedEntry, setSelected] = React.useState<MemoryEntry | null>(null)
  const [prevScreen, setPrev]        = React.useState<Screen>('dashboard')

  const navigate    = (next: Screen)   => { setPrev(screen); setScreen(next) }
  const selectEntry = (e: MemoryEntry) => { setSelected(e); setPrev(screen); setScreen('detail') }
  const goBack      = ()               => setScreen(prevScreen)

  // Sin proyecto resuelto → mostrar selector
  if (!project) {
    return (
      <Box flexDirection="column" paddingX={1} paddingTop={1}>
        <Box borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
          <Box justifyContent="space-between">
            <Text bold color="cyan">team-memory</Text>
            <Text dimColor>{url.replace(/\/mcp\/?$/, '')}</Text>
          </Box>
        </Box>
        <ProjectSelector url={url} onSelect={slug => setProject(slug)} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Header url={url} project={project} screen={screen} />

      {screen === 'dashboard' && isAdmin && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="red" dimColor>⚙  Admin  </Text>
          <Text dimColor>Presioná </Text>
          <Text bold inverse> A </Text>
          <Text dimColor> para gestionar usuarios e invites</Text>
        </Box>
      )}

      {screen === 'dashboard' && (
        <Dashboard url={url} project={project} onNavigate={navigate} isAdmin={isAdmin} />
      )}
      {screen === 'list' && (
        <EntryList url={url} project={project} onNavigate={navigate} onSelectEntry={selectEntry} />
      )}
      {screen === 'search' && (
        <Search url={url} project={project} onNavigate={navigate} onSelectEntry={selectEntry} />
      )}
      {screen === 'detail' && selectedEntry && (
        <EntryDetail entry={selectedEntry} url={url} onNavigate={navigate} onBack={goBack} />
      )}
      {screen === 'compact' && (
        <Compact url={url} project={project} onNavigate={navigate} />
      )}
      {screen === 'admin' && isAdmin && apiToken && (
        <Admin url={url} apiToken={apiToken} onNavigate={navigate} />
      )}
      {screen === 'admin' && !isAdmin && (
        <Box paddingX={2} paddingY={1}>
          <Text color="red">✗ Acceso denegado — se requiere rol admin.</Text>
        </Box>
      )}
    </Box>
  )
}
