import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Pas de dépendance à git à l'intérieur du conteneur Docker de build — un
  // horodatage suffit à invalider le cache de /~offline à chaque build.
  additionalPrecacheEntries: [{ url: '/~offline', revision: String(Date.now()) }],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}

export default withSerwist(nextConfig)
