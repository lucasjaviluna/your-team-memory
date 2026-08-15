import React        from 'react'
import { Box, Text } from 'ink'
import type { Screen } from '../types.js'

const LABELS: Record<Screen, string> = {
  dashboard:'Dashboard', list:'Entradas', search:'Búsqueda',
  detail:'Detalle', edit:'Editar', compact:'Compactación', admin:'Admin',
}
const COLORS: Record<Screen, string> = {
  dashboard:'cyan', list:'green', search:'yellow',
  detail:'blue', edit:'magenta', compact:'red', admin:'red',
}
interface Props { project: string; screen: Screen; url: string }
export function Header({ project, screen, url }: Props) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
      <Box justifyContent="space-between">
        <Box gap={1}>
          <Text bold color="cyan">team-memory</Text>
          <Text color="gray">›</Text>
          <Text bold color={COLORS[screen]}>{LABELS[screen]}</Text>
        </Box>
        <Box gap={2}>
          <Text color="blue">◉ </Text><Text color="gray">{project}</Text>
          <Text dimColor>{url.replace(/\/mcp\/?$/, '')}</Text>
        </Box>
      </Box>
    </Box>
  )
}
