'use client'

import { useEffect, useState } from 'react'

const STEPS = [
  {
    icon: '📷',
    title: 'Capturez',
    description:
      'Prenez vos photos pendant la visite, même sans réseau — comble, vide sanitaire, fondation. Tout se synchronise dès que le signal revient.',
  },
  {
    icon: '✨',
    title: 'Analysez',
    description:
      "Chaque photo est analysée automatiquement pour détecter les anomalies visibles : moisissure, infiltration, isolant, fissures, ventilation.",
  },
  {
    icon: '✅',
    title: 'Révisez',
    description:
      "Vous relisez, corrigez et complétez chaque constat avant qu'il ne quitte votre bureau — le rapport reste sous votre entière responsabilité.",
  },
  {
    icon: '📄',
    title: 'Livrez',
    description:
      'Un rapport PDF structuré est généré, avec synthèse, points prioritaires et numéro de rapport unique, prêt à remettre au client.',
  },
]

const STEP_DURATION_MS = 3200

export function HowItWorks() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((i) => (i + 1) % STEPS.length)
    }, STEP_DURATION_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {STEPS.map((step, i) => (
          <button
            key={step.title}
            onClick={() => setActive(i)}
            className={`text-left rounded-xl border p-4 transition-all duration-500 ${
              active === i
                ? 'border-blue-600 bg-blue-50 shadow-sm scale-[1.02]'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="text-2xl mb-2">{step.icon}</div>
            <div className="font-display font-semibold text-stone-900 text-sm sm:text-base">
              {i + 1}. {step.title}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6 min-h-[96px]">
        <p key={active} className="text-stone-600 leading-relaxed animate-fade-up">
          {STEPS[active].description}
        </p>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {STEPS.map((step, i) => (
          <span
            key={step.title}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              active === i ? 'w-6 bg-blue-600' : 'w-1.5 bg-stone-300'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
