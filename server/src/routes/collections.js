// Firestore-shaped REST API over the ERP document tables.
//
//   GET    /api/collections/:name?where=[[f,op,v],…]&orderBy=f&direction=desc&limit=&offset=
//   GET    /api/collections/:name/:id
//   POST   /api/collections/:name              addDoc     → { id, … }
//   PUT    /api/collections/:name/:id[?merge=1] setDoc
//   PATCH  /api/collections/:name/:id          updateDoc  (dotted paths, $increment…)
//   DELETE /api/collections/:name/:id          deleteDoc
//   POST   /api/batch  { ops: [{ op: set|merge|update|create|delete, collection, id, data }] }
//                                               writeBatch — all or nothing

import { tx } from '../db.js'
import { listDocs, getDocument, writeDoc, deleteDocument, MAX_BATCH } from '../documents.js'
import { badRequest, notFound } from '../lib/errors.js'

function parseWhere(raw) {
  if (!raw) return []
  try {
    const where = JSON.parse(raw)
    if (!Array.isArray(where)) throw new Error()
    return where
  } catch {
    throw badRequest('where: ожидается JSON-массив условий')
  }
}

export default async function collectionRoutes(app, { pool }) {
  const auth = { preHandler: app.authenticate }

  app.get('/api/collections/:name', auth, async (req) => {
    const { where, orderBy, direction, limit, offset } = req.query
    return listDocs(pool, req.user, req.params.name, {
      where: parseWhere(where), orderBy, direction, limit, offset,
    })
  })

  app.get('/api/collections/:name/:id', auth, async (req) => {
    const doc = await getDocument(pool, req.user, req.params.name, req.params.id)
    if (!doc) throw notFound('Документ не найден')
    return doc
  })

  app.post('/api/collections/:name', auth, async (req, reply) => {
    const { id, ...data } = req.body || {}
    const doc = await tx(pool, c => writeDoc(c, req.user, req.params.name, id, data, 'create'))
    return reply.code(201).send(doc)
  })

  app.put('/api/collections/:name/:id', auth, async (req) => {
    const mode = ['1', 'true'].includes(String(req.query.merge)) ? 'merge' : 'set'
    return tx(pool, c => writeDoc(c, req.user, req.params.name, req.params.id, req.body || {}, mode))
  })

  app.patch('/api/collections/:name/:id', auth, async (req) => {
    return tx(pool, c => writeDoc(c, req.user, req.params.name, req.params.id, req.body || {}, 'update'))
  })

  app.delete('/api/collections/:name/:id', auth, async (req) => {
    await tx(pool, c => deleteDocument(c, req.user, req.params.name, req.params.id))
    return { ok: true }
  })

  app.post('/api/batch', {
    ...auth,
    schema: {
      body: {
        type: 'object',
        required: ['ops'],
        properties: {
          ops: {
            type: 'array',
            maxItems: MAX_BATCH,
            items: {
              type: 'object',
              required: ['op', 'collection'],
              properties: {
                op: { enum: ['create', 'set', 'merge', 'update', 'delete'] },
                collection: { type: 'string' },
                id: { type: 'string' },
                data: { type: 'object' },
              },
            },
          },
        },
      },
    },
  }, async (req) => {
    const results = await tx(pool, async (c) => {
      const out = []
      for (const op of req.body.ops) {
        if (op.op === 'delete') {
          if (!op.id) throw badRequest('delete: нужен id')
          await deleteDocument(c, req.user, op.collection, op.id)
          out.push({ id: op.id })
        } else {
          if (op.op !== 'create' && !op.id) throw badRequest(`${op.op}: нужен id`)
          out.push(await writeDoc(c, req.user, op.collection, op.id, op.data || {}, op.op))
        }
      }
      return out
    })
    return { results }
  })
}
