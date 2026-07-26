import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Inspect IA',
  description: "Application d'inspection assistée par IA",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  )
}
