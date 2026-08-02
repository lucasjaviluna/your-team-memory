import React          from 'react'
import { Box }        from 'ink'
import { Header }     from './components/Header.js'
import { Dashboard }  from './screens/Dashboard.js'
import { EntryList }  from './screens/EntryList.js'
import { Search }     from './screens/Search.js'
import { EntryDetail } from './screens/EntryDetail.js'
import { Compact }    from './screens/Compact.js'
import type { MemoryEntry, Screen } from './types.js'

interface Props { url: string; project: string }

export function App({ url, project }: Props) {
  const [screen, setScreen]         = React.useState<Screen>('dashboard')
  const [selectedEntry, setSelected] = React.useState<MemoryEntry | null>(null)
  const [prevScreen, setPrev]        = React.useState<Screen>('dashboard')

  const navigate = (next: Screen) => { setPrev(screen); setScreen(next) }
  const selectEntry = (e: MemoryEntry) => { setSelected(e); setPrev(screen); setScreen('detail') }
  const goBack = () => setScreen(prevScreen)

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Header url={url} project={project} screen={screen} />
      {screen === 'dashboard' && <Dashboard url={url} project={project} onNavigate={navigate} />}
      {screen === 'list'      && <EntryList url={url} project={project} onNavigate={navigate} onSelectEntry={selectEntry} />}
      {screen === 'search'    && <Search    url={url} project={project} onNavigate={navigate} onSelectEntry={selectEntry} />}
      {screen === 'detail' && selectedEntry && <EntryDetail entry={selectedEntry} url={url} onNavigate={navigate} onBack={goBack} />}
      {screen === 'compact'   && <Compact   url={url} project={project} onNavigate={navigate} />}
    </Box>
  )
}
