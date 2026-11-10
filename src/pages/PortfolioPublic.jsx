import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Award, GraduationCap, Quote } from 'lucide-react'
import { api } from '../backend/api'
import Logo from '../components/Logo'
import { RichAnswer } from '../components/student/StudentPortfolio'

// A student's public portfolio: /p/<token>, no login. Shows what the student
// published — see server/src/routes/student.js. Made for a phone first: this
// link is opened from a messenger more often than from a desk.

export default function PortfolioPublic() {
  const { token } = useParams()
  const [data, setData] = useState(undefined) // undefined = loading, null = not found

  useEffect(() => {
    let stopped = false
    api(`/api/public/portfolio/${encodeURIComponent(token)}`, { auth: false })
      .then(d => { if (!stopped) { setData(d); document.title = `${d.title || d.student.name} — портфолио` } })
      .catch(() => { if (!stopped) setData(null) })
    return () => { stopped = true }
  }, [token])

  if (data === undefined) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <Logo size="md" variant="auto" />
        <p className="text-lg font-semibold text-slate-800 mt-4">Портфолио не найдено</p>
        <p className="text-sm text-slate-500 max-w-xs">Ссылка устарела или автор скрыл страницу. · Sahifa topilmadi yoki yashirilgan.</p>
      </div>
    )
  }

  const fmtDate = (iso) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const s = d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-800">
      <header className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
        <div className="max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center text-2xl font-bold">
            {(data.student.name || '?').trim().charAt(0)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-4 [overflow-wrap:anywhere]">{data.title || data.student.name}</h1>
          {data.title && <p className="text-white/80 mt-1">{data.student.name}</p>}
          {data.student.course && (
            <p className="inline-flex items-center gap-1.5 mt-3 text-xs bg-white/15 rounded-full px-3 py-1">
              <GraduationCap size={14} /> {data.student.course}{data.school ? ` · ${data.school}` : ''}
            </p>
          )}
          {data.about && <p className="text-sm text-white/90 mt-4 whitespace-pre-wrap [overflow-wrap:anywhere]">{data.about}</p>}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 -mt-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] space-y-4">
        {data.items.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            Работы скоро появятся · Ishlar tez orada qo'shiladi
          </div>
        )}
        {data.items.map((item, i) => (
          <article key={item.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-8 h-8 rounded-xl bg-violet-50 text-violet-600 text-sm font-bold flex items-center justify-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">{item.title || 'Работа'}</h2>
                {item.date && <p className="text-xs text-slate-400">{fmtDate(item.date)}</p>}
              </div>
              {item.grade !== undefined && (
                <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
                  <Award size={13} /> {item.grade}{item.maxScore ? `/${item.maxScore}` : ''}
                </span>
              )}
            </div>
            {item.caption && <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.caption}</p>}
            {item.task && (
              <p className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-xl px-3 py-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
                <span className="font-semibold text-slate-600">Задание: </span>{item.task}
              </p>
            )}
            <RichAnswer text={item.answer} className="text-sm text-slate-700 mt-3" />
            {item.feedback && (
              <div className="mt-4 flex gap-2 text-sm text-slate-600 border-l-2 border-violet-200 pl-3">
                <Quote size={14} className="shrink-0 mt-0.5 text-violet-400" />
                <p className="min-w-0 [overflow-wrap:anywhere]">
                  {item.feedback}
                  {item.teacher && <span className="block text-xs text-slate-400 mt-1">— {item.teacher}, преподаватель</span>}
                </p>
              </div>
            )}
          </article>
        ))}
        <footer className="flex flex-col items-center gap-2 pt-6 text-xs text-slate-400">
          <Logo size="sm" variant="auto" />
          <p>Портфолио выпускника</p>
        </footer>
      </main>
    </div>
  )
}
