// Firestore + Storage helpers для кастомных шаблонов договоров.
// Каждый тенант может загрузить свои .docx шаблоны с плейсхолдерами {clientName}, {amount} и т.д.
// Подстановка через docxtemplater.

import { db, storage } from '../firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, where, writeBatch,
} from 'firebase/firestore'
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { saveAs } from 'file-saver'

// Список плейсхолдеров, которые можно использовать в шаблоне договора
export const TEMPLATE_PLACEHOLDERS = [
  { key: 'clientName',        label: 'ФИО студента' },
  { key: 'passport',          label: 'Паспорт студента' },
  { key: 'phone',             label: 'Телефон студента' },
  { key: 'course',            label: 'Название курса' },
  { key: 'tariff',            label: 'Тариф (Standard/VIP/…)' },
  { key: 'amount',            label: 'Стоимость (число)' },
  { key: 'amountFormatted',   label: 'Стоимость с разделителями (6 800 000)' },
  { key: 'amountWords',       label: 'Стоимость прописью' },
  { key: 'contractNumber',    label: 'Номер договора' },
  { key: 'contractDate',      label: 'Дата договора' },
  { key: 'courseStartDate',   label: 'Дата начала курса' },
  { key: 'durationMonths',    label: 'Длительность (мес)' },
  { key: 'schedule',          label: 'Расписание' },
  { key: 'learningFormat',    label: 'Формат (Оффлайн/Онлайн)' },
  // Трёхсторонний (компания-плательщик)
  { key: 'payerCompanyName',       label: 'Название компании-плательщика' },
  { key: 'payerCompanyInn',        label: 'ИНН компании' },
  { key: 'payerCompanyAddress',    label: 'Адрес компании' },
  { key: 'payerCompanyDirector',   label: 'Директор компании' },
  { key: 'payerCompanyBank',       label: 'Реквизиты банка' },
  { key: 'payerCompanyPhone',      label: 'Телефон компании' },
]

// Формат чисел — с разделителями
function formatNumber(n) {
  if (n == null || !isFinite(Number(n))) return ''
  return new Intl.NumberFormat('ru-RU').format(Math.round(Number(n)))
}

// Упрощённое «число прописью» для сумм до 999 999 999 сум (русский)
function numberToWords(num) {
  num = Math.round(Number(num) || 0)
  if (num === 0) return 'ноль'
  const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  const unitsF = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']
  function triplet(n, feminine) {
    const arr = []
    const h = Math.floor(n / 100)
    const rem = n % 100
    const t = Math.floor(rem / 10)
    const u = rem % 10
    if (h) arr.push(hundreds[h])
    if (t === 1) arr.push(teens[u])
    else {
      if (t) arr.push(tens[t])
      if (u) arr.push(feminine ? unitsF[u] : units[u])
    }
    return arr.join(' ')
  }
  const billions = Math.floor(num / 1e9)
  const millions = Math.floor((num % 1e9) / 1e6)
  const thousands = Math.floor((num % 1e6) / 1e3)
  const ones = num % 1e3
  const parts = []
  if (billions) {
    const w = triplet(billions)
    const last = billions % 100 > 10 && billions % 100 < 20 ? 'миллиардов' : ['миллиардов','миллиард','миллиарда','миллиарда','миллиарда','миллиардов'][Math.min(billions % 10, 5)]
    parts.push(`${w} ${last}`)
  }
  if (millions) {
    const w = triplet(millions)
    const last = millions % 100 > 10 && millions % 100 < 20 ? 'миллионов' : ['миллионов','миллион','миллиона','миллиона','миллиона','миллионов'][Math.min(millions % 10, 5)]
    parts.push(`${w} ${last}`)
  }
  if (thousands) {
    const w = triplet(thousands, true)
    const last = thousands % 100 > 10 && thousands % 100 < 20 ? 'тысяч' : ['тысяч','тысяча','тысячи','тысячи','тысячи','тысяч'][Math.min(thousands % 10, 5)]
    parts.push(`${w} ${last}`)
  }
  if (ones) parts.push(triplet(ones))
  return parts.join(' ').trim()
}

// Подготовить объект данных для подстановки — пустые значения превращаем в ''
export function buildTemplateData(raw = {}) {
  const data = { ...raw }
  // Числовые форматы
  data.amount = raw.amount || 0
  data.amountFormatted = formatNumber(raw.amount)
  data.amountWords = numberToWords(raw.amount) + ' сум'
  data.durationMonths = String(raw.durationMonths || '')
  // Убрать undefined/null — docxtemplater показывает "undefined" иначе
  for (const k of Object.keys(data)) {
    if (data[k] === undefined || data[k] === null) data[k] = ''
    else data[k] = String(data[k])
  }
  // Дополнительные варианты ключей для всех перечисленных плейсхолдеров
  for (const ph of TEMPLATE_PLACEHOLDERS) {
    if (data[ph.key] === undefined) data[ph.key] = ''
  }
  return data
}

// ── CRUD ──────────────────────────────────────────────────────────
export async function listTemplates(tenantId) {
  const q = query(collection(db, 'contractTemplates'), where('tenantId', '==', tenantId))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function uploadTemplate({ tenantId, name, description, file, isDefault, createdBy }) {
  // 1. Создаём документ в Firestore (пустой) чтобы получить id для storage path
  const docRef = await addDoc(collection(db, 'contractTemplates'), {
    tenantId,
    name,
    description: description || '',
    fileName: file.name,
    fileSize: file.size,
    isDefault: !!isDefault,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || '',
  })
  // 2. Загружаем файл в Storage
  const storagePath = `${tenantId}/contractTemplates/${docRef.id}_${file.name}`
  const fileRef = storageRef(storage, storagePath)
  await uploadBytes(fileRef, file, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const downloadUrl = await getDownloadURL(fileRef)
  // 3. Обновляем документ со ссылкой
  await updateDoc(docRef, { storagePath, downloadUrl })
  // 4. Если помечен как default — сбросить default у других
  if (isDefault) await setAsDefault(tenantId, docRef.id)
  return { id: docRef.id, tenantId, name, description, fileName: file.name, storagePath, downloadUrl, isDefault: !!isDefault }
}

export async function updateTemplate(id, updates) {
  await updateDoc(doc(db, 'contractTemplates', id), updates)
}

export async function setAsDefault(tenantId, templateId) {
  // Снять флаг у всех остальных
  const all = await listTemplates(tenantId)
  const batch = writeBatch(db)
  for (const t of all) {
    const shouldBeDefault = t.id === templateId
    if (!!t.isDefault !== shouldBeDefault) {
      batch.update(doc(db, 'contractTemplates', t.id), { isDefault: shouldBeDefault })
    }
  }
  await batch.commit()
}

export async function deleteTemplate(template) {
  try {
    if (template.storagePath) {
      await deleteObject(storageRef(storage, template.storagePath)).catch(() => {})
    }
  } catch {}
  await deleteDoc(doc(db, 'contractTemplates', template.id))
}

// ── Рендер договора на основе шаблона ─────────────────────────────
export async function renderTemplateBlob(template, data) {
  if (!template?.downloadUrl) throw new Error('Шаблон не содержит ссылки на файл')
  const response = await fetch(template.downloadUrl)
  if (!response.ok) throw new Error(`Не удалось скачать шаблон: ${response.status}`)
  const arrayBuffer = await response.arrayBuffer()

  const zip = new PizZip(arrayBuffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    // Пустые переменные не ломают рендер
    nullGetter: () => '',
  })

  const preparedData = buildTemplateData(data)
  doc.render(preparedData)

  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
  const safeName = (data.contractNumber || 'contract').replace(/[^\w-]+/g, '_')
  const fileName = `dogovor_${safeName}.docx`
  return { blob, fileName }
}

export async function renderTemplateAndDownload(template, data) {
  const { blob, fileName } = await renderTemplateBlob(template, data)
  saveAs(blob, fileName)
  return fileName
}
