// Simple in-memory rate limiter (resets on cold start)
const rateLimits = {}
const RATE_LIMIT = 30 // messages per hour
const RATE_WINDOW = 60 * 60 * 1000 // 1 hour

function checkRateLimit(studentId) {
  const now = Date.now()
  if (!rateLimits[studentId]) {
    rateLimits[studentId] = { count: 0, resetAt: now + RATE_WINDOW }
  }
  const entry = rateLimits[studentId]
  if (now > entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + RATE_WINDOW
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GOOGLE_AI_KEY
  if (!apiKey) {
    return res.status(500).json({ ok: false, reply: 'AI-помощник временно недоступен. Обратитесь к администратору.' })
  }

  const { message, history, context, studentId } = req.body
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, reply: 'Пожалуйста, введите вопрос.' })
  }

  // Rate limiting
  if (studentId && !checkRateLimit(studentId)) {
    return res.status(429).json({
      ok: false,
      reply: 'Вы превысили лимит сообщений (30 в час). Попробуйте позже или обратитесь к преподавателю.'
    })
  }

  // Build system instruction
  const ctxParts = []
  if (context?.courseName) ctxParts.push(`Курс: ${context.courseName}`)
  if (context?.lessonTitle) ctxParts.push(`Текущий урок: ${context.lessonTitle}`)
  if (context?.lessonContent) ctxParts.push(`Содержание урока:\n${context.lessonContent.slice(0, 2000)}`)

  const systemInstruction = `Ты — INTERNO AI, умный помощник для студентов школы INTERNO (школа современных профессий в Узбекистане).
${ctxParts.join('\n')}

Правила:
- Отвечай кратко и понятно, на языке студента (русский или узбекский — определи по языку вопроса)
- Объясняй в контексте текущего урока и курса
- Если вопрос не по теме курса — вежливо направь к преподавателю
- Используй примеры кода когда уместно (оборачивай в тройные обратные кавычки)
- НЕ давай готовых ответов на домашние задания — помогай разобраться, задавай наводящие вопросы
- Обращайся к студенту по имени: ${context?.studentName || 'студент'}
- Будь дружелюбным и мотивирующим
- Ответы не длиннее 300 слов`

  // Build conversation history for Gemini
  const contents = []

  // Add history (last 10 messages)
  if (history && Array.isArray(history)) {
    history.slice(-10).forEach(h => {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }]
      })
    })
  }

  // Add current message
  contents.push({ role: 'user', parts: [{ text: message }] })

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
            topP: 0.9,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
          ]
        })
      }
    )

    if (!response.ok) {
      const errData = await response.text()
      console.error('Gemini API error:', response.status, errData)
      return res.status(500).json({
        ok: false,
        reply: 'Извини, произошла ошибка при обработке запроса. Попробуй ещё раз.'
      })
    }

    const data = await response.json()
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!reply) {
      return res.status(500).json({
        ok: false,
        reply: 'Не удалось получить ответ. Попробуй переформулировать вопрос.'
      })
    }

    return res.status(200).json({ ok: true, reply })
  } catch (err) {
    console.error('AI Chat error:', err)
    return res.status(500).json({
      ok: false,
      reply: 'Ошибка соединения с AI. Проверьте подключение к интернету.'
    })
  }
}
