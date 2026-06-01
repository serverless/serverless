// In-memory CRUD store for the offline REST example. Module state persists for
// the life of the offline process (single demo instance).
const items = new Map()
let nextId = 1

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const create = async (event) => {
  const data = event.body ? JSON.parse(event.body) : {}
  const id = String(nextId++)
  const item = { id, ...data }
  items.set(id, item)
  return json(201, item)
}

export const get = async (event) => {
  const item = items.get(event.pathParameters?.id)
  return item ? json(200, item) : json(404, { message: 'Not found' })
}

export const list = async () => json(200, [...items.values()])
