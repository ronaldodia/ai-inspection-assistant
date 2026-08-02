export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold text-stone-900 ${className}`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white text-sm">
        IA
      </span>
      Inspect IA
    </span>
  )
}
