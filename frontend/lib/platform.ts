// Isolé dans son propre util pour être testable sans mocker `navigator`
// globalement, et pour n'avoir qu'un seul endroit à changer si on doit un
// jour affiner la détection (ex. exclure certains WebViews Android).
export function isAndroidUserAgent(userAgent: string): boolean {
  return /Android/i.test(userAgent)
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && isAndroidUserAgent(navigator.userAgent)
}
