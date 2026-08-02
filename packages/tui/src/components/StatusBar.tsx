import React        from 'react'
import { Box, Text } from 'ink'
interface Key  { key: string; label: string }
interface Props { keys: Key[]; message?: string; error?: string }
export function StatusBar({ keys, message, error }: Props) {
  return (
    <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Box gap={2} flexWrap="wrap">
        {keys.map(({ key, label }) => (
          <Box key={key} gap={1}><Text bold inverse> {key} </Text><Text color="gray">{label}</Text></Box>
        ))}
      </Box>
      {error && <Text color="red">⚠ {error}</Text>}
      {!error && message && <Text color="green">✓ {message}</Text>}
    </Box>
  )
}
