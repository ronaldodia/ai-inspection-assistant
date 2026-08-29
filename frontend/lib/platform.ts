// Isolé dans son propre util pour être testable sans mocker `navigator`
// globalement, et pour n'avoir qu'un seul endroit à changer si on doit un
// jour affiner la détection (ex. exclure certains WebViews Android).
export function isAndroidUserAgent(userAgent: string): boolean {
  return /Android/i.test(userAgent)
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && isAndroidUserAgent(navigator.userAgent)
}

// Depuis iPadOS 13, Safari se présente par défaut comme macOS ("Macintosh")
// dans l'user-agent — /iPad/ ne matche donc plus que les iPad configurés en
// mode "Site pour mobile". Le multi-touch est le seul signal fiable restant
// pour distinguer un iPad en UA desktop d'un vrai Mac (qui n'a pas d'écran
// tactile).
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

// Mobiles uniquement : la capture caméra intégrée n'a d'intérêt que là où
// l'input file natif ouvre une app caméra séparée. Sur desktop, cliquer
// "Ajouter des photos" doit rester un sélecteur de fichiers classique — pas
// de caméra arrière à ouvrir, et l'usage y est surtout de piocher un fichier
// existant.
export function isMobileDevice(): boolean {
  return isAndroid() || isIOS()
}
