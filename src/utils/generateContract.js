import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType,
  TabStopType, TabStopPosition,
} from 'docx'
import { saveAs } from 'file-saver'

// ─── Month names ──────────────────────────────────────────────────────
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]
const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

// ─── Format date ──────────────────────────────────────────────────────
function formatDateUz(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = UZ_MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return { day, month, year, full: `${day}-${month} ${year}` }
}
function formatDateRu(dateStr) {
  const d = new Date(dateStr)
  const day = d.getDate()
  const month = RU_MONTHS[d.getMonth()]
  const year = d.getFullYear()
  return { day, month, year, full: `${day} ${month} ${year}` }
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

// ─── Tariff mapping ───────────────────────────────────────────────────
const TARIFF_MAP_UZ = {
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

const TARIFF_MAP_RU = {
  'standard': 'Стандартный тариф',
  'vip': 'VIP тариф',
  'premium': 'Премиум тариф',
  'individual': 'Индивидуальный тариф',
  'Стандарт': 'Стандартный тариф',
  'Премиум': 'Премиум тариф',
  'VIP': 'VIP тариф',
  'Индивидуальный': 'Индивидуальный тариф',
  'Стандарт Тариф': 'Стандартный тариф',
  'Премиум Тариф': 'Премиум тариф',
  'VIP Тариф': 'VIP тариф',
  'Standart': 'Стандартный тариф',
  'Premium': 'Премиум тариф',
  'Individual': 'Индивидуальный тариф',
  'Онлайн': 'Онлайн тариф',
  'Оффлайн': 'Оффлайн тариф',
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

// ═══════════════════════════════════════════════════════════════════════════
// UZBEK contract sections builder
// ═══════════════════════════════════════════════════════════════════════════
function buildUzbekContract(data, contractDate, courseStartDate, courseNameUz, tariff, duration, schedule, contractNum) {
  const threeParty = !!data.isCompanyPayer
  return [
    // TITLE
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
    new Paragraph({
      spacing: { before: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        r('Toshkent shahri'),
        r(`\t${contractDate.year} - yil  ${String(contractDate.day).padStart(2, '0')} - ${contractDate.month}`),
      ],
    }),
    new Paragraph({ spacing: { before: 120 }, children: [] }),

    // PREAMBLE
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 80 },
      children: threeParty ? [
        r("\u201CInterno Edu\u201D MCHJ, Ustav asosida faoliyat yuritayotgan bosh direktor Toshpulatov A.A. (keyingi o\u2018rinlarda \u2013 "),
        rb("\u201CBajaruvchi\u201D"),
        r('), bir tomondan, '),
        rb(data.clientName || '_______________'),
        r('  va pasport  '),
        rb(data.passport || '_______________'),
        r(" (keyingi o\u2018rinlarda \u2013 "),
        rb("\u201CBuyurtmachi\u201D"),
        r('), ikkinchi tomondan, hamda '),
        rb(data.payerCompanyName || '_______________'),
        r(' (STIR: '),
        rb(data.payerCompanyInn || '_______________'),
        r('), '),
        rb(data.payerCompanyDirector || '_______________'),
        r(" shaxsida faoliyat yuritayotgan (keyingi o\u2018rinlarda \u2013 "),
        rb("\u201CTo\u2018lovchi\u201D"),
        r("), uchinchi tomondan, quyidagicha uch tomonlama shartnoma tuzdilar:"),
      ] : [
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

    // 1. SHARTNOMA PREDMETI
    new Paragraph({ spacing: { before: 100 }, children: [rb('Shartnoma predmeti')] }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 40 },
      children: [
        r(`Bajaruvchi \u201C ${courseNameUz} \u201D yo\u2018nalishi bo\u2018yicha`),
        ...(data.courseDetails ? [r(` ( ${data.courseDetails} )`)] : []),
        r(threeParty
          ? ` guruhli mashg\u2018ulotlar tarzida o\u2018quv kurslarini Buyurtmachiga taqdim etadi, To\u2018lovchi esa ushbu xizmatlar uchun to\u2018lovni Buyurtmachi nomidan amalga oshiradi.`
          : ` guruhli mashg\u2018ulotlar tarzida o\u2018quv kurslarini taqdim etadi, Buyurtmachi esa ushbu xizmatlar uchun to\u2018lovni amalga oshiradi.`),
      ],
    }),
    new Paragraph({ spacing: { before: 40 }, children: [r(`Ta\u2019lim dasturining davomiyligi \u2013 ${duration} oy`)] }),
    new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [
        r(`Kurs boshlanish sanasi: ${courseStartDate.day} ${courseStartDate.month} ${courseStartDate.year} - yil`),
        ...(schedule ? [r(` ( ${schedule} ) `)] : []),
      ],
    }),

    // 2. HUQUQLARI
    new Paragraph({ spacing: { before: 80 }, children: [rb("Bajaruvchi va Buyurtmachining huquqlari")] }),
    jp("Bajaruvchi ta\u2019lim jarayonini mustaqil ravishda olib borish, baholash tizimi, shakli, tartibi va oraliq hamda yakuniy attestatsiya (baholash) muddatlarini belgilash huquqiga ega.", { before: 40 }),
    jp("Buyurtmachi quyidagi o\u2018quv shartlarini bajarmagan taqdirda: uyga vazifa topshiriqlarini bajarmaslik, ta\u2019lim jarayonida ishtirok etishga istak bildirmaslik, asosli sabablarsiz darslarni qoldirish \u2013 Bajaruvchi mazkur shartnoma bo\u2018yicha o\u2018z majburiyatlarini bajarishni to\u2018xtatish huquqiga ega."),
    jp("Buyurtmachi Bajaruvchidan ushbu shartnomaning 1-bo\u2018limida ko\u2018rsatilgan xizmatlarni to\u2018g\u2018ri va sifatli bajarilishiga doir masalalar bo\u2018yicha o\u2018z vaqtida axborot berilishini talab qilish huquqiga ega."),
    jp("Shuningdek, Buyurtmachi quyidagi huquqlarga ega:"),
    jp("-Kursdagi o\u2018quv jarayoni bo\u2018yicha Bajaruvchining xodimlariga murojaat qilish;"),
    jp("-O\u2018rganilayotgan dastur doirasidagi bilim darajasi haqida to\u2018liq va ishonchli ma\u2019lumot olish;"),
    jp("-O\u2018quv jadvalida belgilangan darslar davomida ta\u2019lim jarayonini amalga oshirish uchun zarur bo\u2018lgan Bajaruvchiga tegishli ashyolar va jihozlardan foydalanish;"),
    jp("-Bajaruvchi tomonidan tashkil etilgan madaniy va jamoaviy tadbirlarda ishtirok etish."),

    // 3. BAJARUVCHINING MAJBURIYATLARI
    new Paragraph({ spacing: { before: 80 }, children: [rb("Bajaruvchining majburiyatlari:")] }),
    jp("Bajaruvchi quyidagilarga majbur:", { before: 40 }),
    jp("Bajaruvchi tomonidan belgilangan qabul shartlarini bajargan Buyurtmachini Kurslarga qabul qilish."),
    jp("Ushbu shartnomaning 1-bo\u2018limida ko\u2018rsatilgan xizmatlarni ta\u2019lim dasturi, o\u2018quv rejasi va Bajaruvchi tomonidan ishlab chiqilgan dars jadvaliga muvofiq ravishda tashkil qilish va sifatli bajarilishini ta\u2019minlash."),
    jp("Buyurtmachi tanlagan ta\u2019lim dasturini o\u2018zlashtirishi uchun zarur sharoitlarni yaratish:"),
    jp("-o\u2018quv dasturi, o\u2018tilgan soatlar soni va dasturni egallash darajasi ko\u2018rsatilgan namunadagi sertifikatni Buyurtmachiga topshirish;"),
    jp("-agar Buyurtmachi o\u2018qishni belgilangan muddatdan oldin tugatsa \u2014 o\u2018tilgan soatlar to\u2018g\u2018risida ma\u2019lumotnoma berish."),
    jp("-3.4. Bajaruvchi kurs boshlanish sanasini o\u2018zgartirish huquqiga ega, bu haqda Buyurtmachini oldindan xabardor qilgan holda."),
    jp("-3.5. Ta\u2019lim samaradorligini oshirish maqsadida zamonaviy o\u2018qitish uslublari, o\u2018quv materiallari va texnik vositalardan foydalanish."),

    // 4. BUYURTMACHINING MAJBURIYATLARI
    new Paragraph({ spacing: { before: 80 }, children: [rb("Buyurtmachining majburiyatlari Buyurtmachi quyidagilarga majbur:")] }),
    jp("Ushbu shartnomaning 1-bo\u2018limida ko\u2018rsatilgan xizmatlar uchun to\u2018lovni o\u2018z vaqtida amalga oshirish.", { before: 40 }),
    jp("Kurslarga qabul qilinishda Bajaruvchiga zarur hujjatlarni o\u2018z vaqtida taqdim etish."),
    jp("Darslarga qatnashmaslik sabablari jiddiy bo\u2018lsa, bu haqda Bajaruvchini xabardor qilish."),
    jp("Bajaruvchining o\u2018qituvchilari va o\u2018quv yordamchi xodimlariga hurmat bilan munosabatda bo\u2018lish."),
    jp("Dars jadvalida ko\u2018rsatilgan mashg\u2018ulotlarda muntazam qatnashish."),
    new Paragraph({ spacing: { before: 20 }, children: [] }),
    jp("Bajaruvchining ichki tartib-qoidalariga, o\u2018quv intizomiga va umumiy odob-axloq me\u2019yorlariga rioya qilish, kurs ishtirokchilariga nisbatan hurmatni saqlash."),
    jp("Bajaruvchiga tegishli bo\u2018lgan mol-mulkning yo\u2018qolishi yoki shikastlanishi uchun to\u2018liq javobgarlikni o\u2018z zimmasiga olish."),

    // 5. XIZMATLAR QIYMATI
    new Paragraph({ spacing: { before: 80 }, children: [rb("Xizmatlar qiymati")] }),
    jp("Ushbu shartnoma bo\u2018yicha ta\u2019lim xizmatlarining qiymati kelishilgan tartibda belgilanadi.", { before: 40 }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 30 },
      children: [
        r("Shartnoma bo\u2018yicha umumiy to\u2018lov summasi: "),
        rb(`${formatAmount(data.amount || 0)} `),
        r(`so\u2018mni tashkil qiladi ( ${tariff} ) `),
      ],
    }),
    jp(threeParty
      ? "To\u2018lov To\u2018lovchi (kompaniya) tomonidan bank o\u2018tkazmasi orqali Bajaruvchining hisob raqamiga amalga oshiriladi."
      : "To\u2018lov buyurtmachi tomonidan bank orqali yoki o\u2018quv markazi kassasiga amalga oshiriladi."),
    jp("To\u2018lov amalga oshirilgani Bajaruvchi tomonidan berilgan kvitansiya/to\u2018lov topshiriqnomasi bilan tasdiqlanadi."),
    ...(threeParty ? [
      jp("To\u2018lovchi ushbu shartnoma bo\u2018yicha Buyurtmachiga ko\u2018rsatilgan ta\u2019lim xizmatlari uchun to\u2018lovni belgilangan muddatlarda to\u2018liq amalga oshirish majburiyatini oladi."),
      jp("To\u2018lov Buyurtmachi tomonidan amalga oshirilmagan taqdirda, javobgarlik To\u2018lovchi zimmasiga yuklanadi."),
    ] : []),

    // 6. TOPSHIRISH TARTIBI
    new Paragraph({ spacing: { before: 80 }, children: [rb("Xizmatlarni topshirish va qabul qilish tartibi")] }),
    jp("To\u2018lov qilingan o\u2018quv davri yakunlangandan so\u2018ng va loyiha taqdimotidan keyin Bajaruvchi Buyurtmachiga o\u2018quv kursini tamomlaganligi haqida sertifikat topshiradi.", { before: 40 }),

    // 7. NIZOLAR
    new Paragraph({ spacing: { before: 80 }, children: [rb("Tomonlarning nizolarni hal etish tartibi va javobgarligi")] }),
    jp("Tomonlar o\u2018rtasida yuzaga kelgan nizolar va kelishmovchiliklar muzokaralar orqali hal qilinadi.", { before: 40 }),
    jp("Muzokaralar natijasida hal etilmagan nizolar Bajaruvchi joylashgan hududdagi arbitraj sudiga ko\u2018rib chiqishga yuboriladi."),
    jp("Shartnoma shartlariga amal qilinmasa yoki noto\u2018g\u2018ri bajarilsa, tomonlar O\u2018zbekiston Respublikasi amaldagi qonunchiligiga muvofiq javobgar bo\u2018ladi."),

    // 8. AMAL QILISH MUDDATI
    new Paragraph({ spacing: { before: 80 }, children: [rb("Shartnomaning amal qilish muddati")] }),
    jp("Ushbu shartnoma ikki tomon tomonidan imzolangan paytdan kuchga kiradi va tomonlar o\u2018z majburiyatlarini to\u2018liq bajargunga qadar amal qiladi.", { before: 40 }),
    jp("Buyurtmachi to\u2018langan o\u2018quv davri tugagach, istalgan vaqtda shartnomani bekor qilish huquqiga ega. Agar Buyurtmachi o\u2018qishni belgilangan muddat tugamasidan oldin o\u2018z ixtiyori bilan to\u2018xtatsa, to\u2018langan mablag\u2018 qaytarilmaydi."),

    // 9. YAKUNIY QOIDALAR
    new Paragraph({ spacing: { before: 80 }, children: [rb("Yakuniy qoidalar")] }),
    jp("Ushbu shartnoma ikki nusxada tuzilgan bo\u2018lib, har bir tomon uchun bittadan nusxasi mavjud. Har ikkala nusxa teng yuridik kuchga ega.", { before: 40 }),

    new Paragraph({ spacing: { before: 200 }, children: [] }),

    // SIGNATURE TABLE
    buildSignatureTable(data, 'uz'),
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// RUSSIAN contract sections builder
// ═══════════════════════════════════════════════════════════════════════════
function buildRussianContract(data, contractDate, courseStartDate, tariff, duration, schedule, contractNum) {
  const courseName = data.course || '___'
  const threeParty = !!data.isCompanyPayer
  return [
    // TITLE
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60 },
      children: [rb(`ДОГОВОР №  ${contractNum}`)],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [r('Об оказании платных образовательных услуг')],
    }),
    new Paragraph({
      spacing: { before: 40 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        r('г. Ташкент'),
        r(`\t${String(contractDate.day).padStart(2, '0')} ${contractDate.month} ${contractDate.year} г.`),
      ],
    }),
    new Paragraph({ spacing: { before: 120 }, children: [] }),

    // PREAMBLE
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 80 },
      children: threeParty ? [
        r('ООО \u201CInterno Edu\u201D, в лице генерального директора Тошпулатова А.А., действующего на основании Устава (далее \u2013 '),
        rb('\u201CИсполнитель\u201D'),
        r('), с одной стороны, '),
        rb(data.clientName || '_______________'),
        r(', паспорт '),
        rb(data.passport || '_______________'),
        r(' (далее \u2013 '),
        rb('\u201CЗаказчик\u201D'),
        r('), со второй стороны, и '),
        rb(data.payerCompanyName || '_______________'),
        r(' (ИНН: '),
        rb(data.payerCompanyInn || '_______________'),
        r('), в лице '),
        rb(data.payerCompanyDirector || '_______________'),
        r(' (далее \u2013 '),
        rb('\u201CПлательщик\u201D'),
        r('), с третьей стороны, заключили настоящий трёхсторонний договор о нижеследующем:'),
      ] : [
        r('ООО \u201CInterno Edu\u201D, в лице генерального директора Тошпулатова А.А., действующего на основании Устава (далее \u2013 '),
        rb('\u201CИсполнитель\u201D'),
        r('), с одной стороны, и '),
        rb(data.clientName || '_______________'),
        r(', паспорт '),
        rb(data.passport || '_______________'),
        r(' (далее \u2013 '),
        rb('\u201CЗаказчик\u201D'),
        r('), с другой стороны, заключили настоящий договор о нижеследующем:'),
      ],
    }),

    // 1. ПРЕДМЕТ ДОГОВОРА
    new Paragraph({ spacing: { before: 100 }, children: [rb('Предмет договора')] }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 40 },
      children: [
        r(`Исполнитель предоставляет учебные курсы по направлению \u201C${courseName}\u201D`),
        ...(data.courseDetails ? [r(` (${data.courseDetails})`)] : []),
        r(threeParty
          ? ' в формате групповых занятий Заказчику, а Плательщик осуществляет оплату за данные услуги от имени Заказчика.'
          : ' в формате групповых занятий, а Заказчик осуществляет оплату за данные услуги.'),
      ],
    }),
    new Paragraph({ spacing: { before: 40 }, children: [r(`Продолжительность учебной программы \u2013 ${duration} месяцев`)] }),
    new Paragraph({
      spacing: { before: 40, after: 80 },
      children: [
        r(`Дата начала курса: ${contractDate.day} ${contractDate.month} ${contractDate.year} г.`),
        ...(schedule ? [r(` ( ${schedule} ) `)] : []),
      ],
    }),

    // 2. ПРАВА ИСПОЛНИТЕЛЯ И ЗАКАЗЧИКА
    new Paragraph({ spacing: { before: 80 }, children: [rb('Права Исполнителя и Заказчика')] }),
    jp('Исполнитель имеет право самостоятельно вести образовательный процесс, устанавливать систему оценивания, её форму, порядок и сроки промежуточной и итоговой аттестации (оценки).', { before: 40 }),
    jp('В случае невыполнения Заказчиком следующих учебных требований: невыполнение домашних заданий, нежелание участвовать в образовательном процессе, пропуск занятий без уважительных причин \u2013 Исполнитель имеет право прекратить выполнение своих обязательств по настоящему договору.'),
    jp('Заказчик имеет право требовать от Исполнителя своевременного предоставления информации по вопросам надлежащего и качественного оказания услуг, указанных в разделе 1 настоящего договора.'),
    jp('Кроме того, Заказчик имеет следующие права:'),
    jp('-Обращаться к сотрудникам Исполнителя по вопросам учебного процесса на курсе;'),
    jp('-Получать полную и достоверную информацию об уровне знаний в рамках изучаемой программы;'),
    jp('-Пользоваться принадлежащими Исполнителю материалами и оборудованием, необходимыми для проведения учебного процесса во время занятий, указанных в учебном расписании;'),
    jp('-Участвовать в культурных и коллективных мероприятиях, организованных Исполнителем.'),

    // 3. ОБЯЗАННОСТИ ИСПОЛНИТЕЛЯ
    new Paragraph({ spacing: { before: 80 }, children: [rb('Обязанности Исполнителя:')] }),
    jp('Исполнитель обязан:', { before: 40 }),
    jp('Принять Заказчика на Курсы при выполнении условий приёма, установленных Исполнителем.'),
    jp('Организовать и обеспечить качественное оказание услуг, указанных в разделе 1 настоящего договора, в соответствии с учебной программой, учебным планом и расписанием занятий, разработанными Исполнителем.'),
    jp('Создать необходимые условия для освоения Заказчиком выбранной учебной программы:'),
    jp('-вручить Заказчику сертификат установленного образца с указанием учебной программы, количества пройденных часов и степени освоения программы;'),
    jp('-в случае досрочного завершения обучения Заказчиком \u2014 выдать справку о пройденных часах.'),
    jp('-3.4. Исполнитель имеет право изменить дату начала курса, предварительно уведомив об этом Заказчика.'),
    jp('-3.5. Использовать современные методы обучения, учебные материалы и технические средства в целях повышения эффективности образования.'),

    // 4. ОБЯЗАННОСТИ ЗАКАЗЧИКА
    new Paragraph({ spacing: { before: 80 }, children: [rb('Обязанности Заказчика. Заказчик обязан:')] }),
    jp('Своевременно осуществлять оплату за услуги, указанные в разделе 1 настоящего договора.', { before: 40 }),
    jp('Своевременно предоставить Исполнителю необходимые документы при зачислении на Курсы.'),
    jp('При наличии уважительных причин неявки на занятия уведомить об этом Исполнителя.'),
    jp('Проявлять уважение к преподавателям и учебно-вспомогательному персоналу Исполнителя.'),
    jp('Регулярно посещать занятия, указанные в расписании.'),
    new Paragraph({ spacing: { before: 20 }, children: [] }),
    jp('Соблюдать внутренние правила Исполнителя, учебную дисциплину и общепринятые нормы поведения, проявлять уважение к участникам курса.'),
    jp('Принять на себя полную ответственность за утрату или повреждение имущества, принадлежащего Исполнителю.'),

    // 5. СТОИМОСТЬ УСЛУГ
    new Paragraph({ spacing: { before: 80 }, children: [rb('Стоимость услуг')] }),
    jp('Стоимость образовательных услуг по настоящему договору устанавливается в согласованном порядке.', { before: 40 }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 30 },
      children: [
        r('Общая сумма оплаты по договору составляет: '),
        rb(`${formatAmount(data.amount || 0)} `),
        r(`сум ( ${tariff} ) `),
      ],
    }),
    jp(threeParty
      ? 'Оплата производится Плательщиком (компанией) банковским переводом на расчётный счёт Исполнителя.'
      : 'Оплата производится Заказчиком через банк или в кассу учебного центра.'),
    jp('Факт оплаты подтверждается квитанцией/платёжным поручением, выданным Исполнителю.'),
    ...(threeParty ? [
      jp('Плательщик обязуется осуществить оплату образовательных услуг, оказываемых Заказчику, в полном объёме и в согласованные сроки.'),
      jp('В случае неисполнения обязанности по оплате со стороны Заказчика, ответственность за оплату несёт Плательщик.'),
    ] : []),

    // 6. ПОРЯДОК СДАЧИ И ПРИЁМКИ УСЛУГ
    new Paragraph({ spacing: { before: 80 }, children: [rb('Порядок сдачи и приёмки услуг')] }),
    jp('По завершении оплаченного учебного периода и после защиты проекта Исполнитель вручает Заказчику сертификат об окончании учебного курса.', { before: 40 }),

    // 7. ПОРЯДОК РАЗРЕШЕНИЯ СПОРОВ
    new Paragraph({ spacing: { before: 80 }, children: [rb('Порядок разрешения споров и ответственность сторон')] }),
    jp('Споры и разногласия, возникшие между сторонами, разрешаются путём переговоров.', { before: 40 }),
    jp('Споры, не урегулированные путём переговоров, передаются на рассмотрение в арбитражный суд по месту нахождения Исполнителя.'),
    jp('В случае неисполнения или ненадлежащего исполнения условий договора стороны несут ответственность в соответствии с действующим законодательством Республики Узбекистан.'),

    // 8. СРОК ДЕЙСТВИЯ ДОГОВОРА
    new Paragraph({ spacing: { before: 80 }, children: [rb('Срок действия договора')] }),
    jp('Настоящий договор вступает в силу с момента подписания обеими сторонами и действует до полного выполнения сторонами своих обязательств.', { before: 40 }),
    jp('Заказчик имеет право расторгнуть договор в любое время после окончания оплаченного учебного периода. Если Заказчик добровольно прекращает обучение до истечения установленного срока, оплаченные средства не возвращаются.'),

    // 9. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ
    new Paragraph({ spacing: { before: 80 }, children: [rb('Заключительные положения')] }),
    jp('Настоящий договор составлен в двух экземплярах, по одному для каждой стороны. Оба экземпляра имеют одинаковую юридическую силу.', { before: 40 }),

    new Paragraph({ spacing: { before: 200 }, children: [] }),

    // SIGNATURE TABLE
    buildSignatureTable(data, 'ru'),
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// Signature table (shared)
// ═══════════════════════════════════════════════════════════════════════════
function buildSignatureTable(data, lang) {
  const isRu = lang === 'ru'
  const threeParty = !!data.isCompanyPayer

  if (threeParty) return buildThreePartySignatureTable(data, lang)

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            width: { size: 4680, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [rb(isRu ? 'Исполнитель \u201CInterno Edu\u201D' : 'Bajaruvchi \u201CInterno Edu\u201D')],
              }),
              new Paragraph({ children: [] }),
              new Paragraph({
                children: [r(isRu
                  ? 'Адрес: г. Ташкент, Мирзо-Улугбекский район, ул. Хирмонтепа, дом 34Б'
                  : 'Manzil: Toshkent shahri, Mirzo Ulug\u2018bek tumani, Xirmontepa ko\u2018chasi, 34B-uy')],
              }),
              new Paragraph({
                children: [r(isRu
                  ? 'Расчётный счёт: 2020 8000 7053 5951 4001 Банк: АТБ \u201CОриент Финанс\u201D, МФО: 01071 ИНН: 308 290 853'
                  : 'Hisob raqami: 2020 8000 7053 5951 4001 Bank: ATB \u201COrient Finans\u201D, MFO: 01071 STIR (INN): 308 290 853')],
              }),
              new Paragraph({
                children: [r(isRu ? 'ОКЭД: 85590' : 'SOEID (OKED): 85590')],
              }),
              new Paragraph({ spacing: { before: 80 }, children: [r(isRu ? 'Телефон: +998 94 676 88 58' : 'Telefon: +998 94 676 88 58')] }),
            ],
          }),
          new TableCell({
            borders: cellBorders,
            width: { size: 4680, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [rb(isRu ? 'Заказчик' : 'Buyurtmachi ')],
              }),
              new Paragraph({ children: [rb(data.clientName || '_______________')] }),
              new Paragraph({ children: [r(`${isRu ? 'Адрес' : 'Manzil'}: ${data.address || (isRu ? 'Ташкент' : 'Toshkent')}`)] }),
              new Paragraph({ children: [r(`${isRu ? 'Паспорт' : 'Pasport'}:${data.passport || '_______________'}`)] }),
              new Paragraph({ children: [r(`${isRu ? 'ПИНФЛ' : 'JShShIR'}: ${data.jshshir || ''}`)] }),
              new Paragraph({ children: [] }),
              new Paragraph({ children: [] }),
              new Paragraph({ children: [] }),
              new Paragraph({ children: [r(`${isRu ? 'Тел' : 'Tel'}: ${data.phone || '_______________'}`)] }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            width: { size: 4680, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({ children: [r(isRu ? 'Генеральный директор' : 'Bosh direktor')] }),
              new Paragraph({ children: [r(isRu ? 'Тошпулатов А.А.' : 'Toshpulatov A.A.')] }),
            ],
          }),
          new TableCell({
            borders: cellBorders,
            width: { size: 4680, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({ children: [r(isRu ? 'Заказчик' : 'Buyurtmachi')] }),
              new Paragraph({ children: [r('_______________________')] }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Three-party signature table (Исполнитель | Заказчик | Плательщик)
// ═══════════════════════════════════════════════════════════════════════════
function buildThreePartySignatureTable(data, lang) {
  const isRu = lang === 'ru'
  // 3 columns across ~9360 dxa total
  const col = 3120
  const cellCommon = {
    borders: cellBorders,
    width: { size: col, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  }

  const executorCell = new TableCell({
    ...cellCommon,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [rb(isRu ? 'Исполнитель \u201CInterno Edu\u201D' : 'Bajaruvchi \u201CInterno Edu\u201D')],
      }),
      new Paragraph({ children: [r(isRu
        ? 'Адрес: г. Ташкент, Мирзо-Улугбекский район, ул. Хирмонтепа, дом 34Б'
        : 'Manzil: Toshkent shahri, Mirzo Ulug\u2018bek tumani, Xirmontepa ko\u2018chasi, 34B-uy')] }),
      new Paragraph({ children: [r(isRu
        ? 'Р/с: 2020 8000 7053 5951 4001, АТБ \u201COrient Finans\u201D, МФО: 01071, ИНН: 308 290 853'
        : 'Hisob raqami: 2020 8000 7053 5951 4001, ATB \u201COrient Finans\u201D, MFO: 01071, STIR: 308 290 853')] }),
      new Paragraph({ children: [r(isRu ? 'ОКЭД: 85590' : 'OKED: 85590')] }),
      new Paragraph({ spacing: { before: 80 }, children: [r(isRu ? 'Телефон: +998 94 676 88 58' : 'Tel: +998 94 676 88 58')] }),
      new Paragraph({ spacing: { before: 120 }, children: [r(isRu ? 'Генеральный директор' : 'Bosh direktor')] }),
      new Paragraph({ children: [r(isRu ? 'Тошпулатов А.А.' : 'Toshpulatov A.A.')] }),
      new Paragraph({ spacing: { before: 40 }, children: [r('_______________________')] }),
    ],
  })

  const clientCell = new TableCell({
    ...cellCommon,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [rb(isRu ? 'Заказчик' : 'Buyurtmachi')],
      }),
      new Paragraph({ children: [rb(data.clientName || '_______________')] }),
      new Paragraph({ children: [r(`${isRu ? 'Адрес' : 'Manzil'}: ${data.address || (isRu ? 'Ташкент' : 'Toshkent')}`)] }),
      new Paragraph({ children: [r(`${isRu ? 'Паспорт' : 'Pasport'}: ${data.passport || '_______________'}`)] }),
      new Paragraph({ children: [r(`${isRu ? 'ПИНФЛ' : 'JShShIR'}: ${data.jshshir || ''}`)] }),
      new Paragraph({ spacing: { before: 80 }, children: [r(`${isRu ? 'Тел' : 'Tel'}: ${data.phone || '_______________'}`)] }),
      new Paragraph({ spacing: { before: 120 }, children: [r(isRu ? 'Подпись' : 'Imzo')] }),
      new Paragraph({ spacing: { before: 40 }, children: [r('_______________________')] }),
    ],
  })

  const payerCell = new TableCell({
    ...cellCommon,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [rb(isRu ? 'Плательщик' : 'To\u2018lovchi')],
      }),
      new Paragraph({ children: [rb(data.payerCompanyName || '_______________')] }),
      new Paragraph({ children: [r(`${isRu ? 'ИНН' : 'STIR'}: ${data.payerCompanyInn || '_______________'}`)] }),
      new Paragraph({ children: [r(`${isRu ? 'Адрес' : 'Manzil'}: ${data.payerCompanyAddress || '_______________'}`)] }),
      new Paragraph({ children: [r(`${isRu ? 'Банк' : 'Bank'}: ${data.payerCompanyBank || '_______________'}`)] }),
      new Paragraph({ spacing: { before: 80 }, children: [r(`${isRu ? 'Тел' : 'Tel'}: ${data.payerCompanyPhone || '_______________'}`)] }),
      new Paragraph({ spacing: { before: 120 }, children: [r(`${isRu ? 'Директор' : 'Direktor'}: ${data.payerCompanyDirector || '_______________'}`)] }),
      new Paragraph({ spacing: { before: 40 }, children: [r('_______________________')] }),
    ],
  })

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [col, col, col],
    rows: [new TableRow({ children: [executorCell, clientCell, payerCell] })],
  })
}

/**
 * Generate an INTERNO School contract document
 * @param {object} data - Contract data
 * @param {string} data.lang - Language: 'ru' for Russian, 'uz' for Uzbek (default 'uz')
 */
/**
 * Build the contract .docx blob and filename without triggering a download.
 * Useful for uploading to storage or attaching to emails/Telegram.
 */
export async function buildContractBlob(data) {
  const lang = data.lang || 'uz'
  const isRu = lang === 'ru'

  const contractDate = isRu
    ? formatDateRu(data.contractDate || new Date().toISOString().split('T')[0])
    : formatDateUz(data.contractDate || new Date().toISOString().split('T')[0])
  const courseStartDate = isRu
    ? formatDateRu(data.courseStartDate || data.contractDate || new Date().toISOString().split('T')[0])
    : formatDateUz(data.courseStartDate || data.contractDate || new Date().toISOString().split('T')[0])

  const courseNameUz = COURSE_MAP[data.course] || data.course
  const tariff = isRu
    ? (TARIFF_MAP_RU[data.tariff] || data.tariff || 'Стандартный тариф')
    : (TARIFF_MAP_UZ[data.tariff] || data.tariff || 'Standart tarif')
  const duration = data.durationMonths || 3
  const schedule = data.schedule || ''
  const contractNum = data.contractNumber || ''

  const children = isRu
    ? buildRussianContract(data, contractDate, courseStartDate, tariff, duration, schedule, contractNum)
    : buildUzbekContract(data, contractDate, courseStartDate, courseNameUz, tariff, duration, schedule, contractNum)

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
      children,
    }],
  })

  const blob = await Packer.toBlob(doc)
  const prefix = isRu ? 'Договор' : 'Shartnoma'
  const fileName = `${prefix}_${(data.clientName || 'client').replace(/\s+/g, '_')}_${contractNum || 'N'}.docx`
  return { blob, fileName }
}

export async function generateContract(data) {
  const { blob, fileName } = await buildContractBlob(data)
  saveAs(blob, fileName)
  return fileName
}
