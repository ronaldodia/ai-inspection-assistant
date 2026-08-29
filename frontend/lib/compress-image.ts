// Partagé entre les deux sources d'image possibles : un fichier venant du
// sélecteur natif (compressImage) et une frame vidéo venant de la capture
// caméra intégrée (captureVideoFrame) — même redimensionnement, même qualité
// d'encodage, un seul endroit à ajuster si ça doit changer.
async function drawScaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number
): Promise<Blob> {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas non supporté')
  ctx.drawImage(source, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compression échouée'))),
      'image/jpeg',
      quality
    )
  })
}

export async function compressImage(
  file: File,
  maxDimension = 2048,
  quality = 0.8
): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    return await drawScaled(bitmap, bitmap.width, bitmap.height, maxDimension, quality)
  } finally {
    // Libère explicitement la mémoire du bitmap décodé plutôt que d'attendre
    // le GC — utile sur Android où les photos très haute résolution (50+ MP)
    // peuvent représenter plusieurs centaines de Mo non compressées.
    bitmap.close()
  }
}

// Capture directement la résolution native de la frame vidéo affichée dans
// l'aperçu caméra intégrée — pas de décodage JPEG intermédiaire comme pour
// compressImage(), donc un seul passage canvas au lieu de deux.
export async function captureVideoFrame(
  video: HTMLVideoElement,
  maxDimension = 2048,
  quality = 0.8
): Promise<Blob> {
  return drawScaled(video, video.videoWidth, video.videoHeight, maxDimension, quality)
}
