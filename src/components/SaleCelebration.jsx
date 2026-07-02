import { useState, useEffect, useRef, useCallback } from 'react'
import { Trophy, TrendingUp, X } from 'lucide-react'

// ─── Victory moment after saving a sale ─────────────────────────────────
// Full-screen overlay: gold confetti burst, jackpot-style amount count-up,
// manager's monthly plan progress bar animating to its new value with
// milestone celebrations at 50/75/100%. Cha-ching sound via Web Audio
// (no audio files). Auto-closes after ~4.5s, any click closes instantly.
//
// Props:
//   amount        — sale amount (сум)
//   salesCount    — manager's Nth sale this month (1-based)
//   planRevenue   — manager's monthly plan (0 = no plan set)
//   prevRevenue   — month revenue BEFORE this sale
//   newRevenue    — month revenue AFTER this sale
//   onClose       — dismiss callback

const AUTO_CLOSE_MS = 4500
const CONFETTI_COLORS = ['#fbbf24', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316']

function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ')
}

// Synthesized "cha-ching": two quick bright pings + shimmer. No files needed.
function playChaChing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const master = ctx.createGain()
    master.gain.value = 0.18
    master.connect(ctx.destination)

    const ping = (freq, t0, dur = 0.5) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + t0)
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + t0 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + dur)
      osc.connect(gain)
      gain.connect(master)
      osc.start(ctx.currentTime + t0)
      osc.stop(ctx.currentTime + t0 + dur)
    }
    // coin drop: E6 → B6, then a high shimmer chord
    ping(1318.5, 0)
    ping(1975.5, 0.09)
    ping(2637, 0.18, 0.7)
    ping(3136, 0.18, 0.7)
    setTimeout(() => ctx.close().catch(() => {}), 1500)
  } catch { /* audio blocked — celebration works without it */ }
}

// Lightweight canvas confetti — no dependencies.
function launchConfetti(canvas, { waves = 2, perWave = 90 } = {}) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = window.devicePixelRatio || 1
  const W = canvas.clientWidth, H = canvas.clientHeight
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.scale(dpr, dpr)

  let particles = []
  const spawnWave = (delayMs) => setTimeout(() => {
    for (let i = 0; i < perWave; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      const speed = 9 + Math.random() * 9
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.25,
        y: H * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        life: 1,
        decay: 0.006 + Math.random() * 0.006,
      })
    }
  }, delayMs)
  for (let wv = 0; wv < waves; wv++) spawnWave(wv * 550)

  let raf
  const tick = () => {
    ctx.clearRect(0, 0, W, H)
    particles = particles.filter(p => p.life > 0 && p.y < H + 30)
    for (const p of particles) {
      p.vy += 0.32           // gravity
      p.vx *= 0.985          // drag
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life -= p.decay
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.max(0, p.life)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

export default function SaleCelebration({ amount, salesCount, planRevenue, prevRevenue, newRevenue, onClose }) {
  const canvasRef = useRef(null)
  const closedRef = useRef(false)
  const [shownAmount, setShownAmount] = useState(0)
  const [barPercent, setBarPercent] = useState(
    planRevenue > 0 ? Math.min(100, (prevRevenue / planRevenue) * 100) : 0
  )
  const [milestone, setMilestone] = useState(null)

  const prevPct = planRevenue > 0 ? Math.min(100, (prevRevenue / planRevenue) * 100) : 0
  const newPct = planRevenue > 0 ? Math.min(100, (newRevenue / planRevenue) * 100) : 0
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  const close = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose?.()
  }, [onClose])

  // Confetti + sound + auto-close
  useEffect(() => {
    playChaChing()
    let stopConfetti = () => {}
    if (!reducedMotion && canvasRef.current) {
      // milestone crossing → extra celebratory wave
      const crossed100 = prevPct < 100 && newPct >= 100
      stopConfetti = launchConfetti(canvasRef.current, {
        waves: crossed100 ? 4 : 2,
        perWave: crossed100 ? 120 : 90,
      })
    }
    const timer = setTimeout(close, AUTO_CLOSE_MS)
    return () => { stopConfetti(); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Jackpot count-up: 0 → amount over ~1.2s with ease-out
  useEffect(() => {
    if (reducedMotion) { setShownAmount(amount); return }
    const DURATION = 1200
    const start = performance.now()
    let raf
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION)
      const eased = 1 - Math.pow(1 - t, 3)
      setShownAmount(amount * eased)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount])

  // Plan bar: animate prev% → new% after the count-up lands
  useEffect(() => {
    if (planRevenue <= 0) return
    const t1 = setTimeout(() => {
      setBarPercent(newPct)
      // milestone label
      if (prevPct < 100 && newPct >= 100) setMilestone('👑 ПЛАН ВЫПОЛНЕН!')
      else if (prevPct < 75 && newPct >= 75) setMilestone('🔥 75% плана!')
      else if (prevPct < 50 && newPct >= 50) setMilestone('⚡ Половина плана!')
    }, reducedMotion ? 0 : 1100)
    return () => clearTimeout(t1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm cursor-pointer select-none"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <button
        onClick={close}
        className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>

      <div className="relative text-center px-6 animate-[celebration-pop_0.45s_cubic-bezier(0.34,1.56,0.64,1)]">
        <div className="mx-auto mb-5 w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/40">
          <Trophy size={40} className="text-white" />
        </div>

        <p className="text-amber-400 font-semibold tracking-widest text-sm uppercase mb-2">Продажа оформлена!</p>

        <p className="text-white font-black text-5xl md:text-6xl tabular-nums tracking-tight mb-2">
          +{fmt(shownAmount)}
          <span className="text-2xl md:text-3xl font-bold text-slate-400 ml-2">сум</span>
        </p>

        {salesCount > 0 && (
          <p className="text-slate-300 text-lg mb-6">
            🔥 {salesCount}-я продажа за месяц
          </p>
        )}

        {planRevenue > 0 && (
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span className="flex items-center gap-1"><TrendingUp size={12} /> Твой план на месяц</span>
              <span className="tabular-nums">{fmt(newRevenue)} / {fmt(planRevenue)}</span>
            </div>
            <div className="relative h-3.5 bg-white/10 rounded-full overflow-hidden">
              {/* milestone ticks */}
              {[50, 75].map(m => (
                <div key={m} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${m}%` }} />
              ))}
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-amber-500 transition-all duration-1000 ease-out"
                style={{ width: `${barPercent}%` }}
              />
            </div>
            <div className="h-8 mt-2.5">
              {milestone && (
                <p className="text-amber-300 font-bold text-xl animate-[celebration-pop_0.4s_cubic-bezier(0.34,1.56,0.64,1)]">
                  {milestone}
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-slate-500 text-xs mt-4">нажмите, чтобы закрыть</p>
      </div>

      <style>{`
        @keyframes celebration-pop {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
