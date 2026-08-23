export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-3">
        <div className="text-4xl">📡</div>
        <h1 className="text-lg font-semibold text-stone-900">Vous êtes hors ligne</h1>
        <p className="text-sm text-stone-600">
          Cette page n&apos;a pas pu être chargée sans connexion. Les photos déjà
          capturées restent enregistrées sur cet appareil et se synchroniseront
          automatiquement au retour du réseau.
        </p>
      </div>
    </div>
  )
}
