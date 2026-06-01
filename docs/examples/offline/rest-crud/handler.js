// Single-function REST CRUD for the offline example. All three routes map to
// this one Lambda, so the in-memory store is shared across requests for the
// life of the offline process (a demo store — real apps use DynamoDB etc.).
const items = new Map()
let nextId = 1

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = async (event) => {
  const method = event.httpMethod
  const id = event.pathParameters?.id

  if (method === 'POST') {
    const data = event.body ? JSON.parse(event.body) : {}
    const created = { id: String(nextId++), ...data }
    items.set(created.id, created)
    return json(201, created)
  }

  if (method === 'GET' && id) {
    const item = items.get(id)
    return item ? json(200, item) : json(404, { message: 'Not found' })
  }

  if (method === 'GET') {
    return json(200, [...items.values()])
  }

  return json(405, { message: 'Method not allowed' })
}
