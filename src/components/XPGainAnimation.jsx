import { useEffect, useState } from 'react'

export default function XPGainAnimation({ amount, trigger }) {
  const [visible, setVisible] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => {
    if (trigger) {
      setKey(k => k + 1)
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 1800)
      return () => clearTimeout(t)
    }
  }, [trigger])

  if (!visible || !amount) return null

  return (
    <div key={key} className="pointer-events-none absolute inset-0 flex items-center justify-center z-50">
      <div className="xp-float-animation flex items-center gap-1.5 bg-amber-500/90 text-white px-4 py-2 rounded-full shadow-lg shadow-amber-500/30 text-sm font-bold">
        <span className="text-base">⚡</span>
        +{amount} XP
      </div>
      <style>{`
        @keyframes xpFloat {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          60% { opacity: 1; transform: translateY(-40px) scale(1.15); }
          100% { opacity: 0; transform: translateY(-70px) scale(0.9); }
        }
        .xp-float-animation {
          animation: xpFloat 1.8s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
