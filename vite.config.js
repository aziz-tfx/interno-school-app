import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Libraries that change rarely get their own long-cached files, so a deploy
// of app code doesn't make browsers download them again. Pages are split
// automatically (see lazyPage in src/App.jsx); the heavy document libraries
// (xlsx, docx, docxtemplater) are imported on demand where they are used.
const VENDOR_CHUNKS = [
  ['vendor-react', ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler', '@remix-run/router']],
  ['vendor-firebase', ['firebase', '@firebase']],
  ['vendor-charts', ['recharts', 'd3-', 'victory-vendor', 'recharts-scale', 'react-smooth', 'decimal.js-light', 'internmap']],
  // One file for all icons instead of a tiny request per icon
  ['vendor-icons', ['lucide-react']],
]

function vendorChunk(id) {
  const i = id.lastIndexOf('node_modules/')
  if (i === -1) return undefined
  const pkg = id.slice(i + 'node_modules/'.length)
  for (const [chunk, names] of VENDOR_CHUNKS) {
    if (names.some(n => pkg === n || pkg.startsWith(n.endsWith('-') ? n : `${n}/`))) return chunk
  }
  return undefined
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
})
