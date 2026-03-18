import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, HeadingLevel,
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
  'Английский': 'Ingliz tili',
  'Подготовка к IELTS': 'IELTS tayyorgarlik',
  'Математика': 'Matematika',
  'IT/Программирование': 'IT/Dasturlash',
  'Русский язык': 'Rus tili',
  'Корейский язык': 'Koreys tili',
  'Подготовка к SAT': 'SAT tayyorgarlik',
  'Робототехника': 'Robototexnika',
}

// ─── Tariff mapping ────────────────────────────────────────────────────────
const TARIFF_MAP = {
  'Стандарт Тариф': 'Standart tarif',
  'Премиум Тариф': 'Premium tarif',
  'VIP Тариф': 'VIP tarif',
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
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
}

/**
 * Generate an INTERNO School contract document
 * @param {Object} data - Contract data
 * @param {string} data.clientName - Full name of the client (Buyurtmachi)
 * @param {string} data.passport - Passport number (e.g. "AD 2374644")
 * @param {string} data.phone - Client phone number
 * @param {string} data.course - Course name (Russian)
 * @param {string} data.courseDetails - Additional course details (e.g. "Python SQL Power BI")
 * @param {number} data.amount - Payment amount in so'm
 * @param {string} data.tariff - Tariff name (Russian)
 * @param {string} data.contractNumber - Contract number
 * @param {string} data.contractDate - Contract date (YYYY-MM-DD)
 * @param {string} data.courseStartDate - Course start date (YYYY-MM-DD)
 * @param {number} data.durationMonths - Course duration in months
 * @param {string} data.schedule - Schedule (e.g. "16:00 - 18:00")
 * @param {string} data.learningFormat - Learning format (Оффлайн/Онлайн/Гибрид)
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
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 720, right: 720, bottom: 720, left: 850 },
        },
      },
      children: [
        // ─── Title ──────────────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [rb(`SHARTNOMA \u2116 ${contractNum}`)],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [r("Pullik ta\u2018lim xizmatlari ko\u2018rsatish to\u2018g\u2018risida")],
        }),

        // ─── City and Date ──────────────────────────────────────────
        new Paragraph({
          spacing: { before: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            r('Toshkent shahri'),
            r(`\t${contractDate.year} - yil  ${String(contractDate.day).padStart(2, '0')} - ${contractDate.month}`),
          ],
        }),

        new Paragraph({ spacing: { before: 120 }, children: [] }),

        // ─── Preamble ──────────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80 },
          children: [
            r("\u201CInterno Edu\u201D MCHJ, Ustav asosida faoliyat yuritayotgan bosh direktor Toshpulatov A.A. (keyingi o\u2018rinlarda \u2013 "),
            rb("\u201CBajaruvchi\u201D"),
            r('), bir tomondan, '),
            rb(data.clientName || '_______________'),
            r(' va pasport '),
            rb(data.passport || '_______________'),
            r(" (keyingi o\u2018rinlarda \u2013 "),
            rb("\u201CBuyurtmachi\u201D"),
            r(') ikkinchi tomondan, quyidagicha shartnoma tuzdilar:'),
          ],
        }),

        // ─── 1. Shartnoma predmeti ──────────────────────────────────
        new Paragraph({
          spacing: { before: 100 },
          children: [rb('1. Shartnoma predmeti')],
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
            r(`Kurs boshlanish sanasi: ${courseStartDate.full} - yil`),
            ...(schedule ? [r(` ( ${schedule})`)] : []),
          ],
        }),

        // ─── 2. Huquqlari ──────────────────────────────────────────
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("2. Bajaruvchi va Buyurtmachining huquqlari")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 40 },
          children: [r("2.1. Bajaruvchi ta\u2019lim jarayonini mustaqil ravishda tashkil qilish, dars jadvali va tarkibini o\u2018zgartirish huquqiga ega.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("2.2. Buyurtmachi shartnoma shartlariga muvofiq xizmatlarni olish huquqiga ega.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("2.3. Buyurtmachi ta\u2019lim jarayonidagi o\u2018zgarishlar haqida xabardor bo\u2018lish huquqiga ega.")],
        }),

        // ─── 3. Majburiyatlari ──────────────────────────────────────
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("3. Tomonlarning majburiyatlari")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 40 },
          children: [r("3.1. Bajaruvchi belgilangan dastur bo\u2018yicha sifatli ta\u2019lim xizmatini ko\u2018rsatishga majbur.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("3.2. Buyurtmachi o\u2018z vaqtida to\u2018lovni amalga oshirishga va ichki tartib-qoidalarga rioya qilishga majbur.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("3.3. Buyurtmachi darslarga muntazam qatnashishga majbur. Sababsiz darslarni o\u2018tkazib yuborgan taqdirda, o\u2018tkazib yuborilgan darslar qayta tiklanmaydi va to\u2018lov qaytarilmaydi.")],
        }),

        // ─── 4. Shartnomani bekor qilish ────────────────────────────
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("4. Shartnomani bekor qilish tartibi")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 40 },
          children: [r("4.1. Buyurtmachi kurs boshlanishidan oldin shartnomani bekor qilsa, to\u2018langan mablag\u2018ning 80% qaytariladi.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("4.2. Kurs boshlangandan so\u2018ng 5 kundan keyin shartnomani bekor qilish holati \u2013 to\u2018lov qaytarilmaydi.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("4.3. Bajaruvchi shartnomani bir tomonlama bekor qilish huquqiga ega, agar Buyurtmachi ichki tartibni buzsa yoki to\u2018lovni 10 kundan ortiq kechiktirsa.")],
        }),

        // ─── 5. Xizmatlar qiymati ──────────────────────────────────
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("5. Xizmatlar qiymati")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 40 },
          children: [
            r(`5.1. Ushbu shartnoma bo\u2018yicha ta\u2019lim xizmatlari uchun to\u2018lov summasi: `),
            rb(`${formatAmount(data.amount || 0)} `),
            r(`so\u2018mni tashkil qiladi ( ${tariffUz} )`),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("5.2. To\u2018lov naqd yoki bank o\u2018tkazmasi orqali amalga oshiriladi.")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 30 },
          children: [r("5.3. To\u2018lov bir martalik yoki bo\u2018lib-bo\u2018lib amalga oshirilishi mumkin (tomonlarning kelishuviga ko\u2018ra).")],
        }),

        // ─── 6. Boshqa shartlar ─────────────────────────────────────
        new Paragraph({
          spacing: { before: 80 },
          children: [rb("6. Boshqa shartlar")],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 40 },
          children: [r("6.1. Ushbu shartnoma ikki nusxada tuzilgan bo\u2018lib, har bir tomon uchun bittadan nusxasi mavjud. Har ikkala nusxa teng yuridik kuchga ega.")],
        }),

        new Paragraph({ spacing: { before: 200 }, children: [] }),

        // ─── Signature Table ────────────────────────────────────────
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [4680, 4680],
          rows: [
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
                      children: [rb('Bajaruvchi'), r('\n'), r('\u201CInterno Edu\u201D')],
                    }),
                    new Paragraph({ children: [] }),
                    new Paragraph({
                      children: [r('Manzil: Toshkent shahri, Mirzo Ulug\u2018bek tumani, Xirmontepa ko\u2018chasi, 34B-uy')],
                    }),
                    new Paragraph({
                      children: [r('Hisob raqami: 2020 8000 7053 5951 4001')],
                    }),
                    new Paragraph({
                      children: [r('Bank: ATB \u201COrient Finans\u201D, MFO: 01071')],
                    }),
                    new Paragraph({
                      children: [r('STIR (INN): 308 290 853')],
                    }),
                    new Paragraph({
                      children: [r('SOEID (OKED): 85590')],
                    }),
                    new Paragraph({ spacing: { before: 80 }, children: [r('Telefon: +998 94 676 88 58')] }),
                    new Paragraph({ spacing: { before: 200 }, children: [r('_______________________')] }),
                    new Paragraph({ children: [r('Toshpulatov A.A.')] }),
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
                      children: [rb('Buyurtmachi')],
                    }),
                    new Paragraph({ children: [] }),
                    new Paragraph({
                      children: [r(`F.I.O: ${data.clientName || '_______________'}`)],
                    }),
                    new Paragraph({
                      children: [r(`Pasport: ${data.passport || '_______________'}`)],
                    }),
                    new Paragraph({
                      children: [r(`Telefon: ${data.phone || '_______________'}`)],
                    }),
                    new Paragraph({ children: [] }),
                    new Paragraph({ children: [] }),
                    new Paragraph({ children: [] }),
                    new Paragraph({ spacing: { before: 200 }, children: [r('_______________________')] }),
                    new Paragraph({ children: [r(data.clientName || '_______________')] }),
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
