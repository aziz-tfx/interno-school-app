// Vercel Serverless Function — push sale data to amoCRM
// POST /api/amo/push-sale

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    AMO_SUBDOMAIN,
    AMO_ACCESS_TOKEN,
    AMO_PIPELINE_ID,
    AMO_STATUS_ID,
  } = process.env

  if (!AMO_SUBDOMAIN || !AMO_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'amoCRM not configured. Set AMO_SUBDOMAIN and AMO_ACCESS_TOKEN in Vercel env.' })
  }

  const BASE = `https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4`
  const headers = {
    'Authorization': `Bearer ${AMO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  }

  try {
    const {
      clientName,
      phone,
      course,
      group,
      amount,
      method,
      date,
      branch,
      tariff,
      contractNumber,
      debt,
      trancheNumber,
      managerName,
      comment,
    } = req.body

    if (!clientName) {
      return res.status(400).json({ error: 'clientName is required' })
    }

    // ─── 1. Search for existing contact by phone ────────────────────
    let contactId = null

    if (phone) {
      const searchRes = await fetch(`${BASE}/contacts?query=${encodeURIComponent(phone)}`, { headers })
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        if (searchData?._embedded?.contacts?.length > 0) {
          contactId = searchData._embedded.contacts[0].id
        }
      }
    }

    // ─── 2. Create or update contact ────────────────────────────────
    if (!contactId) {
      // Create new contact
      const contactPayload = [{
        name: clientName,
        custom_fields_values: [
          ...(phone ? [{
            field_code: 'PHONE',
            values: [{ value: phone, enum_code: 'MOB' }],
          }] : []),
        ],
      }]

      const createRes = await fetch(`${BASE}/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(contactPayload),
      })

      if (!createRes.ok) {
        const err = await createRes.text()
        console.error('Failed to create contact:', err)
        return res.status(502).json({ error: 'Failed to create contact in amoCRM', details: err })
      }

      const createData = await createRes.json()
      contactId = createData?._embedded?.contacts?.[0]?.id
    } else {
      // Update existing contact name
      await fetch(`${BASE}/contacts/${contactId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: clientName }),
      })
    }

    // ─── 3. Create lead (deal) ──────────────────────────────────────
    const pipelineId = AMO_PIPELINE_ID ? Number(AMO_PIPELINE_ID) : undefined
    const statusId = AMO_STATUS_ID ? Number(AMO_STATUS_ID) : undefined

    // Build note text with all sale details
    const noteLines = [
      `Курс: ${course || '—'}`,
      `Группа: ${group || '—'}`,
      `Филиал: ${branch || '—'}`,
      `Тариф: ${tariff || '—'}`,
      `Способ оплаты: ${method || '—'}`,
      `Дата оплаты: ${date || '—'}`,
      `Номер договора: ${contractNumber || '—'}`,
      `Транш №: ${trancheNumber || 1}`,
      `Остаток долга: ${debt || 0} сум`,
      `Менеджер: ${managerName || '—'}`,
      ...(comment ? [`Комментарий: ${comment}`] : []),
    ].join('\n')

    const leadPayload = [{
      name: `${course || 'Курс'} — ${clientName}`,
      price: amount || 0,
      ...(pipelineId ? { pipeline_id: pipelineId } : {}),
      ...(statusId ? { status_id: statusId } : {}),
      _embedded: {
        contacts: [{ id: contactId }],
        tags: [
          { name: branch || 'interno' },
          { name: course || 'course' },
        ],
      },
    }]

    const leadRes = await fetch(`${BASE}/leads`, {
      method: 'POST',
      headers,
      body: JSON.stringify(leadPayload),
    })

    if (!leadRes.ok) {
      const err = await leadRes.text()
      console.error('Failed to create lead:', err)
      return res.status(502).json({ error: 'Failed to create lead in amoCRM', details: err })
    }

    const leadData = await leadRes.json()
    const leadId = leadData?._embedded?.leads?.[0]?.id

    // ─── 4. Add note to lead with full details ──────────────────────
    if (leadId) {
      await fetch(`${BASE}/leads/${leadId}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          note_type: 'common',
          params: { text: noteLines },
        }]),
      })
    }

    return res.status(200).json({
      success: true,
      contactId,
      leadId,
      message: 'Sale pushed to amoCRM',
    })

  } catch (err) {
    console.error('amoCRM push error:', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
