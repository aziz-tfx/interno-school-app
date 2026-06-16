import { useEffect, useRef, useState, useCallback } from 'react'

// Tracked video player for YouTube and Kinescope.
// Reports watch progress via onProgress({ percent, currentTime, duration }).
//
// - YouTube: uses the official IFrame Player API (enablejsapi).
// - Kinescope: uses the official IframePlayer API, passing the same
//   watermark + DRM query params so security is preserved. Falls back
//   to a plain iframe (current behaviour, no tracking) if the API
//   fails to initialise within a short timeout.

let ytApiPromise = null
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

let kinescopeApiPromise = null
function loadKinescopeApi() {
  if (window.Kinescope && window.Kinescope.IframePlayer) return Promise.resolve(window.Kinescope.IframePlayer)
  if (kinescopeApiPromise) return kinescopeApiPromise
  kinescopeApiPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://kinescope.io/player/iframe.player.js'
    tag.async = true
    tag.onload = () => {
      // The API attaches asynchronously; poll briefly
      let tries = 0
      const t = setInterval(() => {
        if (window.Kinescope?.IframePlayer) { clearInterval(t); resolve(window.Kinescope.IframePlayer) }
        else if (++tries > 40) { clearInterval(t); reject(new Error('Kinescope API timeout')) }
      }, 100)
    }
    tag.onerror = () => reject(new Error('Kinescope script failed'))
    document.head.appendChild(tag)
  })
  return kinescopeApiPromise
}

export default function TrackedVideoPlayer({
  videoInfo, lessonTitle, isStudent, watermarkText = '', startAt = 0, onProgress,
}) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const pollRef = useRef(null)
  const [fallback, setFallback] = useState(false)
  const reportedRef = useRef({ percent: 0 })

  const report = useCallback((currentTime, duration) => {
    if (!duration || duration < 1) return
    const percent = Math.min(100, Math.round((currentTime / duration) * 100))
    if (percent > reportedRef.current.percent) {
      reportedRef.current.percent = percent
    }
    onProgress?.({ percent, currentTime, duration })
  }, [onProgress])

  // ─── YouTube ───
  useEffect(() => {
    if (videoInfo?.type !== 'youtube') return
    let cancelled = false
    let player = null
    loadYouTubeApi().then((YT) => {
      if (cancelled || !containerRef.current) return
      player = new YT.Player(containerRef.current, {
        videoId: videoInfo.id,
        playerVars: { rel: 0, modestbranding: 1, enablejsapi: 1 },
        events: {
          onReady: (e) => {
            if (startAt > 0) { try { e.target.seekTo(startAt, true) } catch {} }
          },
          onStateChange: (e) => {
            // 1 = playing
            if (e.data === 1) {
              clearInterval(pollRef.current)
              pollRef.current = setInterval(() => {
                try {
                  report(player.getCurrentTime(), player.getDuration())
                } catch {}
              }, 3000)
            } else {
              clearInterval(pollRef.current)
              try { report(player.getCurrentTime(), player.getDuration()) } catch {}
            }
          },
        },
      })
      playerRef.current = player
    }).catch(() => setFallback(true))

    return () => {
      cancelled = true
      clearInterval(pollRef.current)
      try { player?.destroy?.() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoInfo?.id, videoInfo?.type])

  // ─── Kinescope ───
  useEffect(() => {
    if (videoInfo?.type !== 'kinescope') return
    let cancelled = false
    let player = null

    const params = new URLSearchParams()
    if (watermarkText) {
      params.set('watermark_text', watermarkText)
      params.set('watermark_mode', 'viewer')
    }
    params.set('drm', 'true')
    params.set('dnt', '1')
    params.set('download', 'false')
    const url = `https://kinescope.io/${videoInfo.id}?${params.toString()}`

    // Safety timeout → fallback to plain iframe if API doesn't init
    const failTimer = setTimeout(() => { if (!playerRef.current) setFallback(true) }, 4500)

    loadKinescopeApi().then((IframePlayer) => {
      if (cancelled || !containerRef.current) return
      return IframePlayer.create(containerRef.current, {
        url,
        size: { width: '100%', height: '100%' },
        behavior: { autoPlay: false },
      }).then((p) => {
        player = p
        playerRef.current = p
        clearTimeout(failTimer)
        const Events = p.Events || IframePlayer.Events || {}
        if (startAt > 0) {
          p.once?.(Events.Ready, () => { try { p.seekTo(startAt) } catch {} })
        }
        p.on?.(Events.TimeUpdate, (event) => {
          const data = event?.data || event || {}
          report(data.currentTime, data.duration)
        })
      })
    }).catch(() => { clearTimeout(failTimer); setFallback(true) })

    return () => {
      cancelled = true
      clearTimeout(failTimer)
      try { player?.destroy?.() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoInfo?.id, videoInfo?.type])

  // ─── Fallback: plain iframe (current behaviour, no tracking) ───
  if (fallback || !videoInfo) {
    let src = ''
    if (videoInfo?.type === 'kinescope') {
      const params = new URLSearchParams()
      if (watermarkText) { params.set('watermark_text', watermarkText); params.set('watermark_mode', 'viewer') }
      params.set('drm', 'true'); params.set('dnt', '1'); params.set('download', 'false')
      src = `https://kinescope.io/embed/${videoInfo.id}?${params.toString()}`
    } else if (videoInfo?.type === 'youtube') {
      src = `https://www.youtube.com/embed/${videoInfo.id}`
    }
    return (
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <iframe src={src} title={lessonTitle}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" />
        {isStudent && watermarkText && (
          <div className="pointer-events-none absolute inset-0 z-10 select-none" aria-hidden="true">
            <div className="absolute top-3 left-4 text-white/[0.12] text-[11px] font-medium">{watermarkText}</div>
            <div className="absolute bottom-3 right-4 text-white/[0.12] text-[11px] font-medium">{watermarkText}</div>
          </div>
        )}
      </div>
    )
  }

  // API-managed player mounts into this container
  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      {isStudent && watermarkText && (
        <div className="pointer-events-none absolute inset-0 z-10 select-none" aria-hidden="true">
          <div className="absolute top-3 left-4 text-white/[0.12] text-[11px] font-medium">{watermarkText}</div>
          <div className="absolute bottom-3 right-4 text-white/[0.12] text-[11px] font-medium">{watermarkText}</div>
        </div>
      )}
    </div>
  )
}
