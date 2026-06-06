import { X, Download, Award } from 'lucide-react'

// Printable course-completion certificate. Renders a styled certificate
// and offers print-to-PDF via the browser's native print dialog.
export default function Certificate({ studentName, courseName, schoolName, date, onClose }) {
  const handlePrint = () => {
    const html = document.getElementById('certificate-printable')?.innerHTML
    if (!html) return
    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head><title>Сертификат — ${studentName}</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Georgia, 'Times New Roman', serif; }
        .cert { width: 1056px; height: 740px; padding: 60px; position: relative;
          background: linear-gradient(135deg, #0f0a1e 0%, #1a1033 50%, #0d0820 100%);
          color: #fff; display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center; }
        .border { position: absolute; inset: 24px; border: 2px solid rgba(167,139,250,0.5);
          border-radius: 12px; }
        .border2 { position: absolute; inset: 32px; border: 1px solid rgba(167,139,250,0.25);
          border-radius: 8px; }
        .badge { width: 90px; height: 90px; border-radius: 50%; margin-bottom: 24px;
          background: linear-gradient(135deg, #8b5cf6, #6366f1); display: flex;
          align-items: center; justify-content: center; font-size: 44px; }
        .school { font-size: 18px; letter-spacing: 4px; text-transform: uppercase;
          color: #a78bfa; margin-bottom: 8px; }
        .title { font-size: 46px; font-weight: bold; margin-bottom: 30px;
          background: linear-gradient(135deg, #c4b5fd, #818cf8); -webkit-background-clip: text;
          -webkit-text-fill-color: transparent; }
        .label { font-size: 15px; color: #94a3b8; margin-bottom: 10px; }
        .name { font-size: 40px; font-weight: bold; color: #fff; margin-bottom: 18px;
          border-bottom: 2px solid rgba(167,139,250,0.4); padding-bottom: 12px;
          display: inline-block; min-width: 400px; }
        .course { font-size: 26px; color: #c4b5fd; margin-bottom: 36px; font-style: italic; }
        .footer { display: flex; gap: 120px; margin-top: 20px; }
        .footer div { font-size: 14px; color: #94a3b8; border-top: 1px solid rgba(167,139,250,0.3);
          padding-top: 8px; min-width: 180px; }
      </style></head><body>${html}</body></html>
    `)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 400)
  }

  const certDate = date || new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Award size={18} className="text-purple-500" /> Ваш сертификат
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700">
              <Download size={15} /> Скачать PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="p-6 bg-slate-100">
          <div id="certificate-printable">
            <div className="cert" style={{
              width: '100%', aspectRatio: '1056/740', padding: '6%', position: 'relative',
              background: 'linear-gradient(135deg, #0f0a1e 0%, #1a1033 50%, #0d0820 100%)',
              color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', borderRadius: 12,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}>
              <div className="border" style={{ position: 'absolute', inset: '3%', border: '2px solid rgba(167,139,250,0.5)', borderRadius: 12 }} />
              <div className="border2" style={{ position: 'absolute', inset: '4.5%', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 8 }} />
              <div className="badge" style={{
                width: 80, height: 80, borderRadius: '50%', marginBottom: 20,
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 40,
              }}>🏆</div>
              <div className="school" style={{ fontSize: 16, letterSpacing: 4, textTransform: 'uppercase', color: '#a78bfa', marginBottom: 8 }}>
                {schoolName || 'INTERNO School'}
              </div>
              <div className="title" style={{
                fontSize: 38, fontWeight: 'bold', marginBottom: 24,
                background: 'linear-gradient(135deg, #c4b5fd, #818cf8)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>Сертификат</div>
              <div className="label" style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>настоящим подтверждается, что</div>
              <div className="name" style={{
                fontSize: 34, fontWeight: 'bold', color: '#fff', marginBottom: 16,
                borderBottom: '2px solid rgba(167,139,250,0.4)', paddingBottom: 10,
                display: 'inline-block', minWidth: 360,
              }}>{studentName}</div>
              <div className="label" style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>успешно завершил(а) курс</div>
              <div className="course" style={{ fontSize: 24, color: '#c4b5fd', marginBottom: 32, fontStyle: 'italic' }}>«{courseName}»</div>
              <div className="footer" style={{ display: 'flex', gap: 100, marginTop: 16 }}>
                <div style={{ fontSize: 13, color: '#94a3b8', borderTop: '1px solid rgba(167,139,250,0.3)', paddingTop: 8, minWidth: 160 }}>
                  {certDate}<br />Дата выдачи
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', borderTop: '1px solid rgba(167,139,250,0.3)', paddingTop: 8, minWidth: 160 }}>
                  {schoolName || 'INTERNO School'}<br />Подпись
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
