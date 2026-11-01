// Card view of list tables on phones.
//
// Add className="table-cards" to a <table>: below md every row becomes a card
// (styles in index.css), and each cell gets its column header as a caption.
// The captions are copied from <thead> here, so the table markup stays a
// normal table. Per-cell roles (data-card attribute on <td>):
//   title    full-width card heading (name / deal / branch)
//   select   checkbox, pinned to the card's top-right corner
//   actions  buttons row at the bottom of the card
//   wide     full-width cell (progress bars, button groups)
//   hide     not shown in the card (row numbers, duplicates of the title)
// A <td data-label="…"> keeps its own caption; data-label="" shows none.

import { useEffect } from 'react'

const AUTO = 'data-label-auto'

function headerLabels(table) {
  const rows = table.tHead?.rows
  if (!rows?.length) return []
  const labels = []
  for (const th of rows[rows.length - 1].cells) {
    const own = th.getAttribute('data-label')
    const text = (own ?? th.textContent ?? '').replace(/\s+/g, ' ').trim()
    for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text)
  }
  return labels
}

export function labelTable(table) {
  const labels = headerLabels(table)
  for (const body of table.tBodies) {
    for (const tr of body.rows) {
      let col = 0
      for (const td of tr.cells) {
        const span = td.colSpan || 1
        if (!td.hasAttribute('data-label') || td.hasAttribute(AUTO)) {
          const label = span > 1 ? '' : (labels[col] || '')
          if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label)
          if (!td.hasAttribute(AUTO)) td.setAttribute(AUTO, '')
        }
        col += span
      }
    }
  }
}

/** Keep captions in sync for every .table-cards table under root (rows come and go). */
export function useTableCardLabels(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof MutationObserver === 'undefined') return
    let frame = 0
    const run = () => {
      frame = 0
      root.querySelectorAll('table.table-cards').forEach(labelTable)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run) }
    run()
    // Only DOM structure / text changes — our own attribute writes don't retrigger it
    const observer = new MutationObserver(schedule)
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [rootRef])
}
