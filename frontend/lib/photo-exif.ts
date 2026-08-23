import { parse } from 'exifr'

export interface PhotoExif {
  lat: number | null
  lon: number | null
  takenAt: string | null
}

const NO_EXIF: PhotoExif = { lat: null, lon: null, takenAt: null }

// Beaucoup de photos n'ont pas d'EXIF exploitable (capture d'écran, image déjà
// recompressée, réglages de confidentialité qui strippent les métadonnées) —
// ce n'est jamais une erreur, juste une absence d'information : l'appelant
// retombe alors sur son comportement actuel (moment de l'upload, pas de géoloc).
export async function readPhotoExif(file: File): Promise<PhotoExif> {
  try {
    const data = await parse(file, { pick: ['DateTimeOriginal', 'CreateDate'], gps: true })
    if (!data) return NO_EXIF

    const date: unknown = data.DateTimeOriginal ?? data.CreateDate
    const takenAt = date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null

    const lat = typeof data.latitude === 'number' ? data.latitude : null
    const lon = typeof data.longitude === 'number' ? data.longitude : null

    return { lat, lon, takenAt }
  } catch {
    return NO_EXIF
  }
}
