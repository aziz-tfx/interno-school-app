import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-[95vw] md:max-w-md',
    md: 'max-w-[95vw] md:max-w-lg',
    lg: 'max-w-[95vw] md:max-w-2xl',
    xl: 'max-w-[95vw] md:max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-md" onClick={onClose} />
      {/* Mobile: bottom sheet. Desktop: centered dialog. */}
      <div className={`relative glass-strong rounded-t-3xl md:rounded-2xl shadow-2xl shadow-black/10 w-full ${sizeClasses[size]} max-h-[92vh] md:max-h-[90vh] overflow-y-auto animate-[scaleIn_200ms_ease-out]`}>
        {/* Drag handle hint on mobile */}
        <div className="md:hidden flex justify-center pt-2">
          <div className="w-10 h-1 rounded-full bg-slate-300/60" />
        </div>
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/20 sticky top-0 glass-strong md:rounded-t-2xl z-10">
          <h3 className="text-base md:text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="p-4 md:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}
