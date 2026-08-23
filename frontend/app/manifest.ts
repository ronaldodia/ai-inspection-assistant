import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Inspect IA',
    short_name: 'Inspect IA',
    description: "Application d'inspection assistée par IA",
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#2563eb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
