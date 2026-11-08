// amoCRM changes in real time: the server receives amoCRM's webhook and
// pushes an 'amo' event over the live stream (server/src/amoLive.js).
// onChange runs (debounced) after every change and after a reconnect.
// Returns { pushing }: true once amoCRM has delivered a webhook since the
// server started — screens then say «обновляется сразу» and poll rarely.
import { useEffect, useRef, useState } from 'react'
import { USE_SERVER, api } from '../backend/api'
import { live } from '../backend/serverStore'

const DEBOUNCE_MS = 500

export default function useAmoLive(onChange) {
  const [pushing, setPushing] = useState(false)
  const handler = useRef(onChange)
  handler.current = onChange

  useEffect(() => {
    if (!USE_SERVER) return
    let cancelled = false
    let timer = null
    api('/api/amo/live')
      .then(({ lastEventAt }) => { if (!cancelled && lastEventAt) setPushing(true) })
      .catch(() => { /* old server / no access: polling only */ })
    const stop = live.listenTable('amo', (evt) => {
      if (!evt.resync) setPushing(true)
      clearTimeout(timer)
      timer = setTimeout(() => handler.current?.(), DEBOUNCE_MS)
    })
    return () => { cancelled = true; clearTimeout(timer); stop() }
  }, [])

  return { pushing }
}
