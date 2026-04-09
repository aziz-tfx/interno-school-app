import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, User, Sparkles } from 'lucide-react'

// Simple markdown-like renderer for code blocks and inline code
function renderMessageText(text) {
  // Split by code blocks (```...```)
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3)
      const newlineIdx = inner.indexOf('\n')
      const code = newlineIdx > -1 ? inner.slice(newlineIdx + 1) : inner
      return (
        <pre key={i} className="bg-slate-900 text-green-300 text-xs rounded-lg p-3 my-2 overflow-x-auto font-mono">
          <code>{code}</code>
        </pre>
      )
    }
    // Handle inline code and bold
    const segments = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    return (
      <span key={i}>
        {segments.map((seg, j) => {
          if (seg.startsWith('`') && seg.endsWith('`')) {
            return <code key={j} className="bg-slate-200 text-violet-700 text-xs px-1.5 py-0.5 rounded font-mono">{seg.slice(1, -1)}</code>
          }
          if (seg.startsWith('**') && seg.endsWith('**')) {
            return <strong key={j}>{seg.slice(2, -2)}</strong>
          }
          return seg
        })}
      </span>
    )
  })
}

export default function AIChat({ isOpen, onClose, context, mode = 'floating' }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200)
  }, [isOpen])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10).map(m => ({ role: m.role, text: m.text })),
          context,
          studentId: context?.studentName || 'anon',
        })
      })

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.reply || 'Не удалось получить ответ.',
        timestamp: Date.now()
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Ошибка соединения. Проверьте интернет и попробуйте снова.',
        timestamp: Date.now()
      }])
    }

    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isOpen) return null

  const greeting = context?.lessonTitle
    ? `Привет${context.studentName ? `, ${context.studentName}` : ''}! Я AI-помощник INTERNO. Задай вопрос по уроку «${context.lessonTitle}» — помогу разобраться.`
    : `Привет${context?.studentName ? `, ${context.studentName}` : ''}! Я AI-помощник INTERNO. Задай любой вопрос по курсу${context?.courseName ? ` «${context.courseName}»` : ''} — помогу разобраться.`

  const chatContent = (
    <div className={`flex flex-col ${mode === 'floating' ? 'h-full' : 'h-[500px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white rounded-t-2xl shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <Sparkles size={16} />
          </div>
          <div>
            <p className="font-semibold text-sm">INTERNO AI</p>
            <p className="text-white/60 text-[10px]">Помощник по обучению</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
        {/* Welcome message */}
        <div className="flex gap-2">
          <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={14} className="text-violet-600" />
          </div>
          <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-slate-700 shadow-sm border border-slate-100 max-w-[85%]">
            {greeting}
          </div>
        </div>

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-violet-600" />
              </div>
            )}
            <div className={`rounded-2xl px-3.5 py-2.5 text-sm max-w-[85%] shadow-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : 'bg-white text-slate-700 rounded-tl-sm border border-slate-100'
            }`}>
              <div className="whitespace-pre-wrap break-words leading-relaxed">
                {msg.role === 'assistant' ? renderMessageText(msg.text) : msg.text}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-blue-600" />
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 bg-violet-100 rounded-full flex items-center justify-center shrink-0">
              <Bot size={14} className="text-violet-600" />
            </div>
            <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-slate-100">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 bg-white border-t border-slate-200 rounded-b-2xl shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Задайте вопрос..."
            rows={1}
            className="flex-1 resize-none bg-slate-100 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 max-h-24"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="w-10 h-10 bg-violet-600 text-white rounded-xl flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">AI может ошибаться. Проверяйте важную информацию.</p>
      </div>
    </div>
  )

  if (mode === 'inline') {
    return (
      <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        {chatContent}
      </div>
    )
  }

  // Floating mode
  return (
    <div className="fixed bottom-24 right-4 md:right-6 w-[360px] md:w-[400px] h-[520px] z-50 rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden border border-slate-200 bg-white animate-in">
      {chatContent}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-in { animation: slideUp 0.25s ease-out; }
      `}</style>
    </div>
  )
}
