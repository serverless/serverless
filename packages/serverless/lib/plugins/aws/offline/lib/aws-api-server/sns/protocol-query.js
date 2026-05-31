/**
 * Query-protocol (form-urlencoded request + XML response) wire adapter for the
 * local SNS emulator.
 *
 * This is the protocol the AWS CLI and the AWS SDKs use against SNS: the action
 * and all parameters arrive as `application/x-www-form-urlencoded` body fields
 * (`Action=Publish&TopicArn=…&Message=…`), with collections expressed through
 * AWS's flat indexed key convention. SNS keys its members with `.entry.N.` (for
 * map-shaped collections like `MessageAttributes` and `Attributes`) and
 * `.member.N.` (for list-shaped collections like `PublishBatchRequestEntries`).
 * Responses are AWS XML.
 *
 * The adapter normalises those flat keys into the same nested `{ action, params }`
 * shape that `ops.runOp` consumes (PascalCase keys, `MessageAttributes` map,
 * `Attributes` map, `PublishBatchRequestEntries` array, …), and renders result
 * objects back to the AWS XML envelope.
 */

import { randomUUID } from 'node:crypto'

const CONTENT_TYPE = 'text/xml'
const XMLNS = 'http://sns.amazonaws.com/doc/2010-03-31/'

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/**
 * Reduce a Hapi payload (raw string / Buffer, or an already-parsed object) to a
 * flat `{ key: value }` map of the form-urlencoded fields.
 *
 * @param {object|string|Buffer|undefined} payload
 * @returns {Record<string, string>}
 */
function toFlatFields(payload) {
  if (payload === undefined || payload === null) return {}

  if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
    const fields = {}
    for (const [key, value] of new URLSearchParams(payload.toString())) {
      fields[key] = value
    }
    return fields
  }

  // Already an object: stringify each scalar value so downstream folding is
  // uniform with the parsed-string path.
  const fields = {}
  for (const [key, value] of Object.entries(payload)) {
    fields[key] = value == null ? '' : String(value)
  }
  return fields
}

/**
 * Collect indexed members of a flat field map under a given prefix (e.g.
 * `MessageAttributes.entry` or `PublishBatchRequestEntries.member`). Returns a
 * map keyed by the index whose values are the per-member sub-field maps (with
 * the `<prefix>.<n>.` removed).
 *
 * @param {Record<string, string>} fields
 * @param {string} prefix - e.g. `'MessageAttributes.entry'`.
 * @returns {Map<string, Record<string, string>>} index → sub-fields.
 */
function collectIndexed(fields, prefix) {
  const byIndex = new Map()
  const head = `${prefix}.`

  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith(head)) continue
    const rest = key.slice(head.length)
    const dot = rest.indexOf('.')
    if (dot === -1) {
      // A bare indexed scalar: index with no sub-field.
      if (!byIndex.has(rest)) byIndex.set(rest, { '': value })
      continue
    }
    const index = rest.slice(0, dot)
    const subKey = rest.slice(dot + 1)
    if (!byIndex.has(index)) byIndex.set(index, {})
    byIndex.get(index)[subKey] = value
  }

  return byIndex
}

/**
 * Sort the entries of an index → sub-fields map by their numeric index.
 *
 * @param {Map<string, object>} byIndex
 * @returns {object[]} sub-field maps in ascending index order.
 */
function orderedByIndex(byIndex) {
  return [...byIndex.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, sub]) => sub)
}

/**
 * Fold a flat sub-field map describing message attributes under a scope prefix
 * (`<scope>.entry.N.Name`, `<scope>.entry.N.Value.DataType`,
 * `<scope>.entry.N.Value.StringValue`, `<scope>.entry.N.Value.BinaryValue`)
 * into a `{ Name: { DataType, StringValue? | BinaryValue? } }` map.
 *
 * @param {Record<string, string>} fields - The flat fields, possibly scoped.
 * @param {string} scope - e.g. `'MessageAttributes'`.
 * @returns {object|undefined} The attributes map, or undefined when none.
 */
function foldMessageAttributes(fields, scope) {
  const byIndex = collectIndexed(fields, `${scope}.entry`)
  if (byIndex.size === 0) return undefined

  const map = {}
  for (const sub of byIndex.values()) {
    const name = sub.Name
    if (name === undefined) continue
    const attribute = {}
    if (sub['Value.DataType'] !== undefined) {
      attribute.DataType = sub['Value.DataType']
    }
    if (sub['Value.StringValue'] !== undefined) {
      attribute.StringValue = sub['Value.StringValue']
    }
    if (sub['Value.BinaryValue'] !== undefined) {
      attribute.BinaryValue = sub['Value.BinaryValue']
    }
    map[name] = attribute
  }
  return map
}

/**
 * Fold `Attributes.entry.N.key` / `Attributes.entry.N.value` pairs into a
 * `{ key: value }` map (used by Subscribe / SetSubscriptionAttributes / etc.).
 *
 * @param {Record<string, string>} fields
 * @returns {object|undefined}
 */
function foldAttributeMap(fields) {
  const byIndex = collectIndexed(fields, 'Attributes.entry')
  if (byIndex.size === 0) return undefined

  const map = {}
  for (const sub of byIndex.values()) {
    if (sub.key !== undefined) map[sub.key] = sub.value
  }
  return map
}

/**
 * Fold one batch entry's flat sub-fields into the PascalCase entry object ops
 * expects, including any nested message attributes.
 *
 * @param {Record<string, string>} sub - One entry's scoped sub-fields.
 * @returns {object}
 */
function foldBatchEntry(sub) {
  const entry = {}
  for (const [key, value] of Object.entries(sub)) {
    // Nested members (MessageAttributes.entry.* etc.) are folded separately.
    if (key.includes('.')) continue
    entry[key] = value
  }

  const messageAttributes = foldMessageAttributes(sub, 'MessageAttributes')
  if (messageAttributes) entry.MessageAttributes = messageAttributes

  return entry
}

/**
 * Fold the `PublishBatchRequestEntries.member.N.*` collection into an array.
 *
 * @param {Record<string, string>} fields
 * @returns {object[]|undefined}
 */
function foldBatchEntries(fields) {
  const byIndex = collectIndexed(fields, 'PublishBatchRequestEntries.member')
  if (byIndex.size === 0) return undefined
  return orderedByIndex(byIndex).map(foldBatchEntry)
}

/** Flat-field key prefixes whose members are folded into structured params. */
const STRUCTURED_PREFIXES = [
  'MessageAttributes.entry.',
  'Attributes.entry.',
  'PublishBatchRequestEntries.member.',
]

/**
 * Parse a query-protocol SNS request into `{ action, params }`.
 *
 * @param {{ payload?: object|string|Buffer }} request
 * @returns {{ action: string, params: object }}
 */
export function parse(request) {
  const fields = toFlatFields(request.payload)

  const params = {}
  // Carry through every scalar field that is not part of a structured group.
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'Action' || key === 'Version') continue
    if (STRUCTURED_PREFIXES.some((prefix) => key.startsWith(prefix))) continue
    params[key] = value
  }

  const messageAttributes = foldMessageAttributes(fields, 'MessageAttributes')
  if (messageAttributes) params.MessageAttributes = messageAttributes

  const attributes = foldAttributeMap(fields)
  if (attributes) params.Attributes = attributes

  const entries = foldBatchEntries(fields)
  if (entries) params.PublishBatchRequestEntries = entries

  return { action: fields.Action, params }
}

// ---------------------------------------------------------------------------
// XML response rendering
// ---------------------------------------------------------------------------

/**
 * Escape a value for inclusion in XML text / attribute content.
 *
 * @param {unknown} value
 * @returns {string}
 */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Render a flat object's scalar fields as `<Key>Value</Key>` elements (skipping
 * undefined values), e.g. for a list member or a batch-result entry.
 *
 * @param {object} record
 * @returns {string}
 */
function renderScalarFields(record) {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join('')
}

/**
 * Render a list of records as `<Wrapper><member>…</member>…</Wrapper>`.
 *
 * @param {string} wrapper - e.g. `'Topics'`.
 * @param {object[]} records
 * @returns {string}
 */
function renderMemberList(wrapper, records) {
  const members = (records ?? [])
    .map((record) => `<member>${renderScalarFields(record)}</member>`)
    .join('')
  return `<${wrapper}>${members}</${wrapper}>`
}

/**
 * Render an attribute map as `<Attributes><entry><key/><value/></entry>…`.
 *
 * @param {object} attributes
 * @returns {string}
 */
function renderAttributeMap(attributes) {
  const entries = Object.entries(attributes ?? {})
    .map(
      ([key, value]) =>
        `<entry><key>${escapeXml(key)}</key><value>${escapeXml(value)}</value></entry>`,
    )
    .join('')
  return `<Attributes>${entries}</Attributes>`
}

/**
 * Render the inner XML of a result `<…Result>` body for a given action.
 *
 * @param {string} action
 * @param {object} result - The plain result object from `runOp`.
 * @returns {string}
 */
function renderResultBody(action, result) {
  switch (action) {
    case 'ListTopics':
      return renderMemberList('Topics', result.Topics)

    case 'ListSubscriptions':
    case 'ListSubscriptionsByTopic':
      return renderMemberList('Subscriptions', result.Subscriptions)

    case 'GetTopicAttributes':
    case 'GetSubscriptionAttributes':
      return renderAttributeMap(result.Attributes)

    case 'PublishBatch':
      return (
        renderMemberList('Successful', result.Successful) +
        renderMemberList('Failed', result.Failed)
      )

    default:
      // Generic: render each scalar result field as its own element.
      return Object.entries(result ?? {})
        .filter(([, value]) => value !== undefined && typeof value !== 'object')
        .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
        .join('')
  }
}

/**
 * Serialize an operation result into the AWS XML response envelope.
 *
 * @param {string} action - The SNS action name.
 * @param {object} result - The plain result object from `runOp`.
 * @param {object} h      - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
export function serialize(action, result, h) {
  const body = renderResultBody(action, result)
  const xml =
    `<${action}Response xmlns="${XMLNS}">` +
    `<${action}Result>${body}</${action}Result>` +
    `<ResponseMetadata><RequestId>${randomUUID()}</RequestId></ResponseMetadata>` +
    `</${action}Response>`
  return h.response(xml).code(200).type(CONTENT_TYPE)
}

/**
 * Serialize an `SnsOpError` into the AWS `ErrorResponse` XML. The `<Type>` is
 * `Receiver` for a server fault (httpStatus >= 500) and `Sender` otherwise.
 *
 * @param {{ awsCode: string, httpStatus: number, message: string }} opError
 * @param {object} h - Hapi response toolkit.
 * @returns {object} Hapi response.
 */
export function serializeError(opError, h) {
  // A server fault (5xx) is a Receiver-side error; anything else is Sender.
  const type = opError.httpStatus >= 500 ? 'Receiver' : 'Sender'
  const xml =
    `<ErrorResponse xmlns="${XMLNS}">` +
    `<Error><Type>${type}</Type><Code>${escapeXml(opError.awsCode)}</Code>` +
    `<Message>${escapeXml(opError.message)}</Message></Error>` +
    `<RequestId>${randomUUID()}</RequestId>` +
    `</ErrorResponse>`
  return h.response(xml).code(opError.httpStatus).type(CONTENT_TYPE)
}
