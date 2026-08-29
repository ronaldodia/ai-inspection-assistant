// Activé uniquement sur l'image de dev (voir build-frontend dans
// .github/workflows/build-and-push.yaml) — jamais sur l'image Azure/prod.
export const DEBUG_MODE = process.env.NEXT_PUBLIC_DEBUG === 'true'

export function describeError(err: unknown, fallback: string): string {
  if (!DEBUG_MODE) return fallback
  if (err instanceof Error) return `${fallback} — [debug] ${err.name}: ${err.message}`
  return `${fallback} — [debug] ${String(err)}`
}
