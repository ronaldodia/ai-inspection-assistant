import Link from 'next/link'
import { Logo } from './Logo'
import { HowItWorks } from './HowItWorks'

const FEATURES = [
  {
    title: 'Capture hors ligne',
    description:
      "Les photos se prennent où qu'importe le signal — sous-sol, vide sanitaire — et se synchronisent automatiquement au retour du réseau.",
  },
  {
    title: 'Vous gardez le dernier mot',
    description:
      'Chaque anomalie détectée passe par un écran de révision avant la remise du rapport. Rien ne part sans votre validation.',
  },
  {
    title: 'Rapport prêt à remettre',
    description:
      'Synthèse, points prioritaires, photos annotées et numéro de rapport unique — un document structuré, pas un fouillis de notes.',
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo />
          <Link
            href="/login"
            className="text-sm font-medium text-stone-600 hover:text-stone-900"
          >
            Se connecter →
          </Link>
        </div>
      </header>

      <main>
        <section className="max-w-3xl mx-auto px-4 pt-16 pb-14 text-center">
          <h1 className="animate-fade-up font-display text-3xl sm:text-5xl font-bold text-stone-900 leading-tight">
            Des inspections préachat
            <br className="hidden sm:block" /> plus rapides à documenter
          </h1>
          <p
            className="animate-fade-up mt-5 text-lg text-stone-600 max-w-xl mx-auto"
            style={{ animationDelay: '120ms' }}
          >
            Capturez vos photos sur le terrain, laissez l&apos;analyse repérer les
            anomalies visibles, puis révisez et générez un rapport professionnel —
            sans changer votre façon de travailler.
          </p>
          <div
            className="animate-fade-up mt-8 flex justify-center gap-3"
            style={{ animationDelay: '220ms' }}
          >
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 text-white px-6 py-3 font-medium hover:bg-blue-700 transition-colors"
            >
              Se connecter
            </Link>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-4 pb-16">
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-stone-900 text-center mb-8">
            Comment ça fonctionne
          </h2>
          <HowItWorks />
        </section>

        <section className="bg-white border-y border-stone-200">
          <div className="max-w-4xl mx-auto px-4 py-14 grid gap-8 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="font-display font-semibold text-stone-900 mb-2">{f.title}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-8 text-center text-sm text-stone-400">
        Inspect IA — outil interne d&apos;assistance à l&apos;inspection préachat.
      </footer>
    </div>
  )
}
