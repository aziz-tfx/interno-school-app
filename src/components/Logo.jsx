/**
 * INTERNO Logo component
 * Renders the official INTERNO branding with optional subtitle
 *
 * Props:
 *   size: 'sm' | 'md' | 'lg' | 'xl' — controls overall scale
 *   variant: 'dark' | 'light' | 'color' — color scheme
 *   showSubtitle: boolean — show "Zamonaviy Kasblar Maktabi"
 *   className: string — additional CSS classes
 */
export default function Logo({ size = 'md', variant = 'dark', showSubtitle = true, className = '' }) {
  const sizes = {
    sm:  { text: 'text-lg',  subtitle: 'text-[7px]', gap: 'gap-0', tracking: 'tracking-[0.15em]' },
    md:  { text: 'text-2xl', subtitle: 'text-[9px]', gap: 'gap-0.5', tracking: 'tracking-[0.18em]' },
    lg:  { text: 'text-4xl', subtitle: 'text-xs',    gap: 'gap-1', tracking: 'tracking-[0.2em]' },
    xl:  { text: 'text-5xl', subtitle: 'text-sm',    gap: 'gap-1', tracking: 'tracking-[0.22em]' },
  }

  const variants = {
    dark:  { main: 'text-slate-900', sub: 'text-slate-600' },
    light: { main: 'text-white', sub: 'text-white/70' },
    color: { main: 'bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent', sub: 'text-blue-300/70' },
  }

  const s = sizes[size] || sizes.md
  const v = variants[variant] || variants.dark

  return (
    <div className={`flex flex-col items-center ${s.gap} ${className}`}>
      <h1
        className={`${s.text} font-black ${v.main} leading-none`}
        style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", letterSpacing: '-0.02em' }}
      >
        INTERNO
      </h1>
      {showSubtitle && (
        <p
          className={`${s.subtitle} font-bold ${v.sub} uppercase ${s.tracking} leading-tight`}
          style={{ fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}
        >
          Zamonaviy Kasblar Maktabi
        </p>
      )}
    </div>
  )
}
