// Call a former Vercel handler from server code (no HTTP request involved).

export async function callHandler(handler, { method = 'POST', tenantId, body = {}, query = {} }) {
  let status = 200
  let out
  const res = {
    setHeader() { return res },
    status(code) { status = code; return res },
    json(obj) { out = obj; return res },
    send(data) { out = data; return res },
    end(data) { out = data; return res },
  }
  await handler({ method, query: { ...query, tenantId }, headers: { 'x-tenant-id': tenantId }, body: { ...body, tenantId } }, res)
  return { status, body: out }
}
