import React        from 'react'
import { Box, Text } from 'ink'
const F = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
export function Spinner({ label = 'Cargando...' }: { label?: string }) {
  const [f, setF] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(() => setF(n => (n+1) % F.length), 80)
    return () => clearInterval(id)
  }, [])
  return <Box gap={1}><Text color="cyan">{F[f]}</Text><Text color="gray">{label}</Text></Box>
}
export function LoadingPanel({ label }: { label?: string }) {
  return <Box flexDirection="column" alignItems="center" paddingY={2}><Spinner label={label} /></Box>
}
export function ErrorPanel({ message, hint }: { message: string; hint?: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1} gap={1}>
      <Text bold color="red">✗ Error</Text>
      <Text>{message}</Text>
      {hint && <Text color="gray">{hint}</Text>}
    </Box>
  )
}
