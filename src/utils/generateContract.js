import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType,
  TabStopType, TabStopPosition,
} from 'docx'
import { saveAs } from 'file-saver'

// ─── Uzbek month names ──────────────────────────────────────────────────────
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

// ─── Format date to Uzbek ──────────────────────────────────────────────────
function formatDateUz(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = UZ_MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return { day, month, year, full: `${day}-${month} ${year}` }
}

// ─── Format number with spaces ─────────────────────────────────────────────
function formatAmount(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// ─── Course name mapping (Russian → Uzbek for contract) ────────────────────
const COURSE_MAP = {
  'Интерьер Дизайн': "Inter\u2019er Dizayn",
  'Дизайн интерьера': "Inter\u2019er Dizayn",
  'Дизайн интерьера Ташкент': "Inter\u2019er Dizayn (Toshkent)",
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
  'Графический дизайн': 'Grafik Dizayn',
  'Веб-разработка': 'Veb-dasturlash',
  'SMM': 'SMM',
  'Маркетинг': 'Marketing',
}

// ─── Tariff mapping (supports both Russian labels and English keys) ─────────
const TARIFF_MAP = {
  'standard': 'Standart tarif',
  'vip': 'VIP tarif',
  'premium': 'Premium tarif',
  'individual': 'Individual tarif',
  'Стандарт': 'Standart tarif',
  'Премиум': 'Premium tarif',
  'VIP': 'VIP tarif',
  'Индивидуальный': 'Individual tarif',
  'Стандарт Тариф': 'Standart tarif',
  'Премиум Тариф': 'Premium tarif',
  'VIP Тариф': 'VIP tarif',
  'Standart': 'Standart tarif',
  'Premium': 'Premium tarif',
  'Individual': 'Individual tarif',
  'Онлайн': 'Onlayn tarif',
  'Оффлайн': 'Oflayn tarif',
}

// ─── Helper: create run with common style ──────────────────────────────────
function r(text, opts = {}) {
  return new TextRun({ text, size: 21, font: 'Times New Roman', ...opts })
}
function rb(text, opts = {}) {
  return new TextRun({ text, size: 21, font: 'Times New Roman', bold: true, ...opts })
}

// ─── Cell border config ────────────────────────────────────────────────────
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

// ─── Helper: justified paragraph ───────────────────────────────────────────
function jp(children, spacing = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 30, ...spacing },
    children: Array.isArray(children) ? children : [r(children)],
  })
}

/**
 * Generate an INTERNO School contract document
 */
export async function generateContract(data) {
  const contractDate = formatDateUz(data.contractDate || new Date().toISOString().split('T')[0])
  const courseStartDate = formatDateUz(data.courseStartDate || data.contractDate || new Date().toISOString().split('T')[0])
  const courseNameUz = COURSE_MAP[data.course] || data.course
  const tariffUz = TARIFF_MAP[data.tariff] || data.tariff || 'Standart tarif'
  const duration = data.durationMonths || 3
  const schedule = data.schedule || ''
  const contractNum = data.contractNumber || ''

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 21 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 720, right: 720, bottom: 720, left: 850 },
        },
      },
      children: [
        // ═══════════════════════════════════════════════════════════════
        // TITLE
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [rb(`SHARTNOMA \u2116  ${contractNum}`)],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [r("Pullik ta\u2018lim xizmatlari ko\u2018rsatish to\u2018g\u2018risida")],
        }),

        // ═══════════════════════════════════════════════════════════════
        // CITY AND DATE
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            r('Toshkent shahri'),
            r(`\t${contractDate.year} - yil  ${String(contractDate.day).padStart(2, '0')} - ${contractDate.month}`),
          ],
        }),

        new Paragraph({ spacing: { before: 120 }, children: [] }),

        // ═══════════════════════════════════════════════════════════════
        // PREAMBLE
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80 },
          children: [
            r("\u201CInterno Edu\u201D MCHJ, Ustav asosida faoliyat yuritayotgan bosh direktor Toshpulatov A.A. (keyingi o\u2018rinlarda \u2013 "),
            rb("\u201CBajaruvchi\u201D"),
            r('), bir tomondan, '),
            rb(data.clientName || '_______________'),
            r('  va pasport  '),
            rb(data.passport || '_______________'),
            r(" (keyingi o\u2018rinlarda \u2013 "),
            rb("\u201CBuyurtmachi\u201D"),
            r(') ikkinchi tomondan, quyidagicha shartnoma tuzdilar:'),
          ],
        }),

        // ═══════════════════════════════════════════════════════════════
        // 1. SHARTNOMA PREDMETI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 100 },
          children: [rb('Shartnoma predmeti')],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 40 },
          children: [
            r(`Bajaruvchi \u201C ${courseNameUz} \u201D yo\u2018nalishi bo\u2018yicha`),
            ...(data.courseDetails ? [r(` ( ${data.courseDetails} )`)] : []),
            r(` guruhli mashg\u2018ulotlar tarzida o\u2018quv kurslarini taqdim etadi, Buyurtmachi esa ushbu xizmatlar uchun to\u2018lovni amalga oshiradi.`),
          ],
        }),
        new Paragraph({
          spacing: { before: 40 },
          children: [r(`Ta\u2019lim dasturining davomiyligi \u2013 ${duration} oy`)],
        }),
        new Paragraph({
          spacing: { before: 40, after: 80 },
          children: [
            r(`Kurs boshlanish sanasi: ${courseStartDate.day} ${courseStartDate.month} ${courseStartDate.year} - yil`),
            ...(schedule ? [r(` ( ${schedule} ) `)] : []),
          ],
        }),

        // ═══════════════════════════════════════════════════════════════
        // 2. BAJARUVCHI VA BUYURTMACHINING HUQUQLARI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Bajaruvchi va Buyurtmachining huquqlari")],
        }),
        jp("Bajaruvchi ta\u2019lim jarayonini mustaqil ravishda olib borish, baholash tizimi, shakli, tartibi va oraliq hamda yakuniy attestatsiya (baholash) muddatlarini belgilash huquqiga ega.", { before: 40 }),
        jp("Buyurtmachi quyidagi o\u2018quv shartlarini bajarmagan taqdirda: uyga vazifa topshiriqlarini bajarmaslik, ta\u2019lim jarayonida ishtirok etishga istak bildirmaslik, asosli sabablarsiz darslarni qoldirish \u2013 Bajaruvchi mazkur shartnoma bo\u2018yicha o\u2018z majburiyatlarini bajarishni to\u2018xtatish huquqiga ega."),
        jp("Buyurtmachi Bajaruvchidan ushbu shartnomaning 1-bo\u2018limida ko\u2018rsatilgan xizmatlarni to\u2018g\u2018ri va sifatli bajarilishiga doir masalalar bo\u2018yicha o\u2018z vaqtida axborot berilishini talab qilish huquqiga ega."),
        jp("Shuningdek, Buyurtmachi quyidagi huquqlarga ega:"),
        jp("-Kursdagi o\u2018quv jarayoni bo\u2018yicha Bajaruvchining xodimlariga murojaat qilish;"),
        jp("-O\u2018rganilayotgan dastur doirasidagi bilim darajasi haqida to\u2018liq va ishonchli ma\u2019lumot olish;"),
        jp("-O\u2018quv jadvalida belgilangan darslar davomida ta\u2019lim jarayonini amalga oshirish uchun zarur bo\u2018lgan Bajaruvchiga tegishli ashyolar va jihozlardan foydalanish;"),
        jp("-Bajaruvchi tomonidan tashkil etilgan madaniy va jamoaviy tadbirlarda ishtirok etish."),

        // ═══════════════════════════════════════════════════════════════
        // 3. BAJARUVCHINING MAJBURIYATLARI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Bajaruvchining majburiyatlari:")],
        }),
        jp("Bajaruvchi quyidagilarga majbur:", { before: 40 }),
        jp("Bajaruvchi tomonidan belgilangan qabul shartlarini bajargan Buyurtmachini Kurslarga qabul qilish."),
        jp("Ushbu shartnomaning 1-bo\u2018limida ko\u2018rsatilgan xizmatlarni ta\u2019lim dasturi, o\u2018quv rejasi va Bajaruvchi tomonidan ishlab chiqilgan dars jadvaliga muvofiq ravishda tashkil qilish va sifatli bajarilishini ta\u2019minlash."),
        jp("Buyurtmachi tanlagan ta\u2019lim dasturini o\u2018zlashtirishi uchun zarur sharoitlarni yaratish:"),
        jp("-o\u2018quv dasturi, o\u2018tilgan soatlar soni va dasturni egallash darajasi ko\u2018rsatilgan namunadagi sertifikatni Buyurtmachiga topshirish;"),
        jp("-agar Buyurtmachi o\u2018qishni belgilangan muddatdan oldin tugatsa \u2014 o\u2018tilgan soatlar to\u2018g\u2018risida ma\u2019lumotnoma berish."),
        jp("-3.4. Bajaruvchi kurs boshlanish sanasini o\u2018zgartirish huquqiga ega, bu haqda Buyurtmachini oldindan xabardor qilgan holda."),
        jp("-3.5. Ta\u2019lim samaradorligini oshirish maqsadida zamonaviy o\u2018qitish uslublari, o\u2018quv materiallari va texnik vositalardan foydalanish."),

        // ═══════════════════════════════════════════════════════════════
        // 4. BUYURTMACHINING MAJBURIYATLARI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Buyurtmachining majburiyatlari Buyurtmachi quyidagilarga majbur:")],
        }),
        jp("Ushbu shartnomaning 1-bo\u2018limida ko\u2018rsatilgan xizmatlar uchun to\u2018lovni o\u2018z vaqtida amalga oshirish.", { before: 40 }),
        jp("Kurslarga qabul qilinishda Bajaruvchiga zarur hujjatlarni o\u2018z vaqtida taqdim etish."),
        jp("Darslarga qatnashmaslik sabablari jiddiy bo\u2018lsa, bu haqda Bajaruvchini xabardor qilish."),
        jp("Bajaruvchining o\u2018qituvchilari va o\u2018quv yordamchi xodimlariga hurmat bilan munosabatda bo\u2018lish."),
        jp("Dars jadvalida ko\u2018rsatilgan mashg\u2018ulotlarda muntazam qatnashish."),
        new Paragraph({ spacing: { before: 20 }, children: [] }),
        jp("Bajaruvchining ichki tartib-qoidalariga, o\u2018quv intizomiga va umumiy odob-axloq me\u2019yorlariga rioya qilish, kurs ishtirokchilariga nisbatan hurmatni saqlash."),
        jp("Bajaruvchiga tegishli bo\u2018lgan mol-mulkning yo\u2018qolishi yoki shikastlanishi uchun to\u2018liq javobgarlikni o\u2018z zimmasiga olish."),

        // ═══════════════════════════════════════════════════════════════
        // 5. XIZMATLAR QIYMATI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Xizmatlar qiymati")],
        }),
        jp("Ushbu shartnoma bo\u2018yicha ta\u2019lim xizmatlarining qiymati kelishilgan tartibda belgilanadi.", { before: 40 }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [
            r("Shartnoma bo\u2018yicha umumiy to\u2018lov summasi: "),
            rb(`${formatAmount(data.amount || 0)} `),
            r(`so\u2018mni tashkil qiladi ( ${tariffUz} ) `),
          ],
        }),
        jp("To\u2018lov buyurtmachi tomonidan bank orqali yoki o\u2018quv markazi kassasiga amalga oshiriladi."),
        jp("To\u2018lov amalga oshirilgani Bajaruvchi tomonidan berilgan kvitansiya bilan tasdiqlanadi."),

        // ═══════════════════════════════════════════════════════════════
        // 6. XIZMATLARNI TOPSHIRISH VA QABUL QILISH TARTIBI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Xizmatlarni topshirish va qabul qilish tartibi")],
        }),
        jp("To\u2018lov qilingan o\u2018quv davri yakunlangandan so\u2018ng va loyiha taqdimotidan keyin Bajaruvchi Buyurtmachiga o\u2018quv kursini tamomlaganligi haqida sertifikat topshiradi.", { before: 40 }),

        // ═══════════════════════════════════════════════════════════════
        // 7. TOMONLARNING NIZOLARNI HAL ETISH TARTIBI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Tomonlarning nizolarni hal etish tartibi va javobgarligi")],
        }),
        jp("Tomonlar o\u2018rtasida yuzaga kelgan nizolar va kelishmovchiliklar muzokaralar orqali hal qilinadi.", { before: 40 }),
        jp("Muzokaralar natijasida hal etilmagan nizolar Bajaruvchi joylashgan hududdagi arbitraj sudiga ko\u2018rib chiqishga yuboriladi."),
        jp("Shartnoma shartlariga amal qilinmasa yoki noto\u2018g\u2018ri bajarilsa, tomonlar O\u2018zbekiston Respublikasi amaldagi qonunchiligiga muvofiq javobgar bo\u2018ladi."),

        // ═══════════════════════════════════════════════════════════════
        // 8. SHARTNOMANING AMAL QILISH MUDDATI
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Shartnomaning amal qilish muddati")],
        }),
        jp("Ushbu shartnoma ikki tomon tomonidan imzolangan paytdan kuchga kiradi va tomonlar o\u2018z majburiyatlarini to\u2018liq bajargunga qadar amal qiladi.", { before: 40 }),
        jp("Buyurtmachi to\u2018langan o\u2018quv davri tugagach, istalgan vaqtda shartnomani bekor qilish huquqiga ega. Agar Buyurtmachi o\u2018qishni belgilangan muddat tugamasidan oldin o\u2018z ixtiyori bilan to\u2018xtatsa, to\u2018langan mablag\u2018 qaytarilmaydi."),

        // ═══════════════════════════════════════════════════════════════
        // 9. YAKUNIY QOIDALAR
        // ═══════════════════════════════════════════════════════════════
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("Yakuniy qoidalar")],
        }),
        jp("Ushbu shartnoma ikki nusxada tuzilgan bo\u2018lib, har bir tomon uchun bittadan nusxasi mavjud. Har ikkala nusxa teng yuridik kuchga ega.", { before: 40 }),

        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // ═══════════════════════════════════════════════════════════════
        // SIGNATURE TABLE
        // ═══════════════════════════════════════════════════════════════
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4680, 4680],
          rows: [
            // Row 1: Details
            new TableRow({
              children: [
                // Bajaruvchi (Executor)
                new TableCell({
                  borders: cellBorders,
                  width: { size: 4680, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 40 },
                      children: [rb('Bajaruvchi \u201CInterno Edu\u201D')],
                    }),
                    new Paragraph({ children: [] }),
                    new Paragraph({
                      children: [r('Manzil: Toshkent shahri, Mirzo Ulug\u2018bek tumani, Xirmontepa ko\u2018chasi, 34B-uy')],
                    }),
                    new Paragraph({
                      children: [r('Hisob raqami: 2020 8000 7053 5951 4001 Bank: ATB \u201COrient Finans\u201D, MFO: 01071 STIR (INN): 308 290 853')],
                    }),
                    new Paragraph({
                      children: [r('SOEID (OKED): 85590')],
                    }),
                    new Paragraph({ spacing: { before: 80 }, children: [r('Telefon: +998 94 676 88 58')] }),
                  ],
                }),
                // Buyurtmachi (Client)
                new TableCell({
                  borders: cellBorders,
                  width: { size: 4680, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 40 },
                      children: [rb('Buyurtmachi ')],
                    }),
                    new Paragraph({
                      children: [rb(data.clientName || '_______________')],
                    }),
                    new Paragraph({
                      children: [r(`Manzil: ${data.address || 'Toshkent'}`)],
                    }),
                    new Paragraph({
                      children: [r(`Pasport:${data.passport || '_______________'}`)],
                    }),
                    new Paragraph({
                      children: [r(`JShShIR: ${data.jshshir || ''}`)],
                    }),
                    new Paragraph({ children: [] }),
                    new Paragraph({ children: [] }),
                    new Paragraph({ children: [] }),
                    new Paragraph({
                      children: [r(`Tel: ${data.phone || '_______________'}`)],
                    }),
                  ],
                }),
              ],
            }),
            // Row 2: Signatures
            new TableRow({
              children: [
                new TableCell({
                  borders: cellBorders,
                  width: { size: 4680, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({ children: [r('Bosh direktor')] }),
                    new Paragraph({ children: [r('Toshpulatov A.A.')] }),
                  ],
                }),
                new TableCell({
                  borders: cellBorders,
                  width: { size: 4680, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({ children: [r('Buyurtmachi')] }),
                    new Paragraph({ children: [r('_______________________')] }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const fileName = `Shartnoma_${(data.clientName || 'client').replace(/\s+/g, '_')}_${contractNum || 'N'}.docx`
  saveAs(blob, fileName)
  return fileName
}
