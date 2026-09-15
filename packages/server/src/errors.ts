export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try { return JSON.stringify(error) } catch { return String(error) }
}

export function toolError(error: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: errorMessage(error) }) }],
    isError: true as const,
  }
}
