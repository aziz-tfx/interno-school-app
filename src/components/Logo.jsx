/**
 * INTERNO Logo component
 * Renders the official INTERNO SVG branding
 *
 * Props:
 *   size: 'sm' | 'md' | 'lg' | 'xl' — controls overall scale
 *   variant: 'dark' | 'light' | 'color' — color scheme
 *   className: string — additional CSS classes
 */
export default function Logo({ size = 'md', variant = 'dark', className = '' }) {
  const sizes = {
    sm:  { width: 'w-28' },
    md:  { width: 'w-40' },
    lg:  { width: 'w-52' },
    xl:  { width: 'w-64' },
  }

  const s = sizes[size] || sizes.md

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/logo.svg"
        alt="INTERNO"
        className={`${s.width} h-auto object-contain`}
      />
    </div>
  )
}
