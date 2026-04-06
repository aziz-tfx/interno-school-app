import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import Logo from '../components/Logo'
import { formatCurrency } from '../data/mockData'

const COURSE_MAP = {
  'Интерьер Дизайн': "Inter'er Dizayn",
  'Дизайн интерьера': "Inter'er Dizayn",
  'Дизайн интерьера Ташкент': "Inter'er Dizayn (Toshkent)",
  'Английский': 'Ingliz tili',
  'Английский язык': 'Ingliz tili',
  'Подготовка к IELTS': 'IELTS tayyorgarlik',
  'IELTS': 'IELTS tayyorgarlik',
  'Математика': 'Matematika',
  'IT/Программирование': 'IT/Dasturlash',
  'Программирование': 'Dasturlash',
  'IT': 'IT',
  'Русский язык': 'Rus tili',
  'Корейский язык': 'Koreys tili',
  'Подготовка к SAT': 'SAT tayyorgarlik',
  'SAT': 'SAT tayyorgarlik',
  'Робототехника': 'Robototexnika',
  'Графический дизайн': 'Grafik dizayn',
  'Веб-разработка': 'Veb-dasturlash',
  'SMM': 'SMM',
  'Маркетинг': 'Marketing',
}

export default function ContractSign() {
  const { paymentId } = useParams()
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [signed, setSigned] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signatureData, setSignatureData] = useState(null)
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const snap = await getDoc(doc(db, 'payments', paymentId))
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() }
          setPayment(data)
          if (data.contractSigned && data.signatureData) {
            setSigned(true)
            setSignatureData(data.signatureData)
          }
        } else {
          setError('Договор не найден')
        }
      } catch (err) {
        console.error(err)
        setError('Ошибка загрузки договора')
      }
      setLoading(false)
    }
    fetchPayment()
  }, [paymentId])

  const initCanvas = () => {
    setSigning(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#1e40af'
      }
    }, 100)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  const handleSign = async () => {
    const canvas = canvasRef.current
    const data = canvas.toDataURL('image/png')
    setSaving(true)
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        signatureData: data,
        contractSigned: true,
        signedAt: new Date().toISOString(),
      })
      setSignatureData(data)
      setSigned(true)
      setSigning(false)
    } catch (err) {
      console.error(err)
      alert('Ошибка сохранения подписи')
    }
    setSaving(false)
  }

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const getTouchPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Ошибка</h2>
          <p className="text-slate-500">{error}</p>
        </div>
      </div>
    )
  }

  const courseUz = COURSE_MAP[payment.course] || payment.course

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <Logo size="lg" variant="dark" />
          <p className="text-slate-500 text-sm mt-2">Электронное подписание договора</p>
        </div>

        {/* Contract Body */}
        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-5" style={{ fontFamily: 'Times New Roman, serif' }}>
          <h2 className="text-center font-bold text-lg">SHARTNOMA №{payment.contractNumber}</h2>
          <p className="text-center text-sm text-slate-600">Pullik ta'lim xizmatlari ko'rsatish to'g'risida</p>

          <div className="flex justify-between text-sm text-slate-600">
            <span>Toshkent shahri</span>
            <span>{payment.date}</span>
          </div>

          <p className="text-sm text-justify leading-relaxed">
            "Interno Edu" MCHJ, Ustav asosida faoliyat yuritayotgan bosh direktor Toshpulatov A.A.
            (keyingi o'rinlarda – <b>"Bajaruvchi"</b>), bir tomondan, <b>{payment.student}</b> va
            pasport <b>{payment.passport || '_______________'}</b> (keyingi o'rinlarda – <b>"Buyurtmachi"</b>)
            ikkinchi tomondan, quyidagicha shartnoma tuzdilar:
          </p>

          <div className="space-y-3 text-sm">
            <p><b>Shartnoma predmeti</b></p>
            <p className="text-justify">
              Bajaruvchi "{courseUz}" yo'nalishi bo'yicha guruhli mashg'ulotlar tarzida
              o'quv kurslarini taqdim etadi, Buyurtmachi esa ushbu xizmatlar uchun to'lovni amalga oshiradi.
            </p>
            <p>Ta'lim dasturining davomiyligi – {payment.durationMonths || 3} oy</p>
            {payment.courseStartDate && <p>Kurs boshlanish sanasi: {payment.courseStartDate}{payment.schedule ? ` ( ${payment.schedule} )` : ''}</p>}

            <p className="pt-2"><b>Bajaruvchi va Buyurtmachining huquqlari</b></p>
            <p className="text-justify">Bajaruvchi ta'lim jarayonini mustaqil ravishda olib borish, baholash tizimi, shakli, tartibi va oraliq hamda yakuniy attestatsiya (baholash) muddatlarini belgilash huquqiga ega.</p>
            <p className="text-justify">Buyurtmachi quyidagi o'quv shartlarini bajarmagan taqdirda: uyga vazifa topshiriqlarini bajarmaslik, ta'lim jarayonida ishtirok etishga istak bildirmaslik, asosli sabablarsiz darslarni qoldirish – Bajaruvchi mazkur shartnoma bo'yicha o'z majburiyatlarini bajarishni to'xtatish huquqiga ega.</p>
            <p className="text-justify">Buyurtmachi Bajaruvchidan ushbu shartnomaning 1-bo'limida ko'rsatilgan xizmatlarni to'g'ri va sifatli bajarilishiga doir masalalar bo'yicha o'z vaqtida axborot berilishini talab qilish huquqiga ega.</p>
            <p className="text-justify">Shuningdek, Buyurtmachi quyidagi huquqlarga ega:</p>
            <p className="text-justify">-Kursdagi o'quv jarayoni bo'yicha Bajaruvchining xodimlariga murojaat qilish;</p>
            <p className="text-justify">-O'rganilayotgan dastur doirasidagi bilim darajasi haqida to'liq va ishonchli ma'lumot olish;</p>
            <p className="text-justify">-O'quv jadvalida belgilangan darslar davomida ta'lim jarayonini amalga oshirish uchun zarur bo'lgan Bajaruvchiga tegishli ashyolar va jihozlardan foydalanish;</p>
            <p className="text-justify">-Bajaruvchi tomonidan tashkil etilgan madaniy va jamoaviy tadbirlarda ishtirok etish.</p>

            <p className="pt-2"><b>Bajaruvchining majburiyatlari:</b></p>
            <p className="text-justify">Bajaruvchi quyidagilarga majbur:</p>
            <p className="text-justify">Bajaruvchi tomonidan belgilangan qabul shartlarini bajargan Buyurtmachini Kurslarga qabul qilish.</p>
            <p className="text-justify">Ushbu shartnomaning 1-bo'limida ko'rsatilgan xizmatlarni ta'lim dasturi, o'quv rejasi va Bajaruvchi tomonidan ishlab chiqilgan dars jadvaliga muvofiq ravishda tashkil qilish va sifatli bajarilishini ta'minlash.</p>
            <p className="text-justify">Buyurtmachi tanlagan ta'lim dasturini o'zlashtirishi uchun zarur sharoitlarni yaratish:</p>
            <p className="text-justify">-o'quv dasturi, o'tilgan soatlar soni va dasturni egallash darajasi ko'rsatilgan namunadagi sertifikatni Buyurtmachiga topshirish;</p>
            <p className="text-justify">-agar Buyurtmachi o'qishni belgilangan muddatdan oldin tugatsa — o'tilgan soatlar to'g'risida ma'lumotnoma berish.</p>
            <p className="text-justify">-3.4. Bajaruvchi kurs boshlanish sanasini o'zgartirish huquqiga ega, bu haqda Buyurtmachini oldindan xabardor qilgan holda.</p>
            <p className="text-justify">-3.5. Ta'lim samaradorligini oshirish maqsadida zamonaviy o'qitish uslublari, o'quv materiallari va texnik vositalardan foydalanish.</p>

            <p className="pt-2"><b>Buyurtmachining majburiyatlari Buyurtmachi quyidagilarga majbur:</b></p>
            <p className="text-justify">Ushbu shartnomaning 1-bo'limida ko'rsatilgan xizmatlar uchun to'lovni o'z vaqtida amalga oshirish.</p>
            <p className="text-justify">Kurslarga qabul qilinishda Bajaruvchiga zarur hujjatlarni o'z vaqtida taqdim etish.</p>
            <p className="text-justify">Darslarga qatnashmaslik sabablari jiddiy bo'lsa, bu haqda Bajaruvchini xabardor qilish.</p>
            <p className="text-justify">Bajaruvchining o'qituvchilari va o'quv yordamchi xodimlariga hurmat bilan munosabatda bo'lish.</p>
            <p className="text-justify">Dars jadvalida ko'rsatilgan mashg'ulotlarda muntazam qatnashish.</p>
            <p className="text-justify mt-1">Bajaruvchining ichki tartib-qoidalariga, o'quv intizomiga va umumiy odob-axloq me'yorlariga rioya qilish, kurs ishtirokchilariga nisbatan hurmatni saqlash.</p>
            <p className="text-justify">Bajaruvchiga tegishli bo'lgan mol-mulkning yo'qolishi yoki shikastlanishi uchun to'liq javobgarlikni o'z zimmasiga olish.</p>

            <p className="pt-2"><b>Xizmatlar qiymati</b></p>
            <p className="text-justify">Ushbu shartnoma bo'yicha ta'lim xizmatlarining qiymati kelishilgan tartibda belgilanadi.</p>
            <p className="text-justify">
              Shartnoma bo'yicha umumiy to'lov summasi: <b>{formatCurrency(payment.totalCoursePrice || payment.amount)}</b> so'mni tashkil qiladi
              {payment.tariff ? ` ( ${payment.tariff} )` : ''}
            </p>
            <p className="text-justify">To'lov buyurtmachi tomonidan bank orqali yoki o'quv markazi kassasiga amalga oshiriladi.</p>
            <p className="text-justify">To'lov amalga oshirilgani Bajaruvchi tomonidan berilgan kvitansiya bilan tasdiqlanadi.</p>

            <p className="pt-2"><b>Xizmatlarni topshirish va qabul qilish tartibi</b></p>
            <p className="text-justify">To'lov qilingan o'quv davri yakunlangandan so'ng va loyiha taqdimotidan keyin Bajaruvchi Buyurtmachiga o'quv kursini tamomlaganligi haqida sertifikat topshiradi.</p>

            <p className="pt-2"><b>Tomonlarning nizolarni hal etish tartibi va javobgarligi</b></p>
            <p className="text-justify">Tomonlar o'rtasida yuzaga kelgan nizolar va kelishmovchiliklar muzokaralar orqali hal qilinadi.</p>
            <p className="text-justify">Muzokaralar natijasida hal etilmagan nizolar Bajaruvchi joylashgan hududdagi arbitraj sudiga ko'rib chiqishga yuboriladi.</p>
            <p className="text-justify">Shartnoma shartlariga amal qilinmasa yoki noto'g'ri bajarilsa, tomonlar O'zbekiston Respublikasi amaldagi qonunchiligiga muvofiq javobgar bo'ladi.</p>

            <p className="pt-2"><b>Shartnomaning amal qilish muddati</b></p>
            <p className="text-justify">Ushbu shartnoma ikki tomon tomonidan imzolangan paytdan kuchga kiradi va tomonlar o'z majburiyatlarini to'liq bajargunga qadar amal qiladi.</p>
            <p className="text-justify">Buyurtmachi to'langan o'quv davri tugagach, istalgan vaqtda shartnomani bekor qilish huquqiga ega. Agar Buyurtmachi o'qishni belgilangan muddat tugamasidan oldin o'z ixtiyori bilan to'xtatsa, to'langan mablag' qaytarilmaydi.</p>

            <p className="pt-2"><b>Yakuniy qoidalar</b></p>
            <p className="text-justify">Ushbu shartnoma ikki nusxada tuzilgan bo'lib, har bir tomon uchun bittadan nusxasi mavjud. Har ikkala nusxa teng yuridik kuchga ega.</p>
          </div>

          {/* Signature Section */}
          <div className="grid grid-cols-2 gap-6 mt-8 pt-6 border-t border-slate-200">
            <div className="text-sm border border-slate-200 rounded-lg p-3">
              <p className="font-bold text-center mb-3">Bajaruvchi "Interno Edu"</p>
              <p className="text-xs text-slate-600">Manzil: Toshkent shahri, Mirzo Ulug'bek tumani, Xirmontepa ko'chasi, 34B-uy</p>
              <p className="text-xs text-slate-600">Hisob raqami: 2020 8000 7053 5951 4001</p>
              <p className="text-xs text-slate-600">Bank: ATB "Orient Finans", MFO: 01071</p>
              <p className="text-xs text-slate-600">STIR (INN): 308 290 853</p>
              <p className="text-xs text-slate-600">SOEID (OKED): 85590</p>
              <p className="text-xs text-slate-600 mt-1">Telefon: +998 94 676 88 58</p>
              <div className="mt-3 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-600">Bosh direktor</p>
                <p className="text-xs text-slate-600 font-medium">Toshpulatov A.A.</p>
              </div>
            </div>
            <div className="text-sm border border-slate-200 rounded-lg p-3">
              <p className="font-bold text-center mb-3">Buyurtmachi</p>
              <p className="text-xs text-slate-600 font-medium">{payment.student}</p>
              <p className="text-xs text-slate-600">Manzil: Toshkent</p>
              <p className="text-xs text-slate-600">Pasport: {payment.passport || '___'}</p>
              <p className="text-xs text-slate-600">Tel: {payment.phone || '___'}</p>

              {signed && signatureData ? (
                <div className="mt-3 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                  <img src={signatureData} alt="Imzo" className="h-14 object-contain mx-auto" />
                  <p className="text-xs text-emerald-600 font-semibold text-center mt-1">✓ Elektron imzo qo'yilgan</p>
                  {payment.signedAt && (
                    <p className="text-[10px] text-emerald-500 text-center">{new Date(payment.signedAt).toLocaleString('ru-RU')}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs mt-4 text-slate-400">_______________________</p>
              )}
            </div>
          </div>

          {/* Sign Action */}
          {!signed && (
            <div className="mt-6 pt-4 border-t border-blue-200">
              <p className="text-sm font-semibold text-blue-800 mb-3">Imzo qo'yish / Подпись</p>
              {!signing ? (
                <button onClick={initCanvas}
                  className="w-full py-4 border-2 border-dashed border-blue-400 rounded-xl text-blue-600 font-medium hover:bg-blue-50 transition-colors text-sm">
                  ✍ Imzo qo'yish uchun bosing / Нажмите для подписи
                </button>
              ) : (
                <div className="space-y-3">
                  <canvas ref={canvasRef} width={500} height={150}
                    className="w-full border-2 border-blue-400 rounded-xl bg-white cursor-crosshair touch-none"
                    onMouseDown={(e) => {
                      isDrawingRef.current = true
                      const { x, y } = getPos(e, canvasRef.current)
                      canvasRef.current.getContext('2d').beginPath()
                      canvasRef.current.getContext('2d').moveTo(x, y)
                    }}
                    onMouseMove={(e) => {
                      if (!isDrawingRef.current) return
                      const { x, y } = getPos(e, canvasRef.current)
                      const ctx = canvasRef.current.getContext('2d')
                      ctx.lineTo(x, y)
                      ctx.stroke()
                    }}
                    onMouseUp={() => { isDrawingRef.current = false }}
                    onMouseLeave={() => { isDrawingRef.current = false }}
                    onTouchStart={(e) => {
                      isDrawingRef.current = true
                      const { x, y } = getTouchPos(e, canvasRef.current)
                      canvasRef.current.getContext('2d').beginPath()
                      canvasRef.current.getContext('2d').moveTo(x, y)
                    }}
                    onTouchMove={(e) => {
                      if (!isDrawingRef.current) return
                      e.preventDefault()
                      const { x, y } = getTouchPos(e, canvasRef.current)
                      const ctx = canvasRef.current.getContext('2d')
                      ctx.lineTo(x, y)
                      ctx.stroke()
                    }}
                    onTouchEnd={() => { isDrawingRef.current = false }}
                  />
                  <div className="flex gap-2">
                    <button onClick={clearCanvas}
                      className="flex-1 px-4 py-2.5 text-sm text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 font-medium">
                      Tozalash / Очистить
                    </button>
                    <button onClick={handleSign} disabled={saving}
                      className="flex-1 px-4 py-2.5 text-sm text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 font-medium disabled:opacity-50">
                      {saving ? '...' : "✓ Tasdiqlash / Подтвердить"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {signed && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-emerald-700 font-semibold">✓ Shartnoma muvaffaqiyatli imzolandi</p>
              <p className="text-emerald-600 text-sm mt-1">Договор успешно подписан</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">INTERNO School &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}
