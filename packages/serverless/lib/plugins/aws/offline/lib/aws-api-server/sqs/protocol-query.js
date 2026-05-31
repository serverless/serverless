/**
 * Query-protocol (form-urlencoded request + XML response) wire adapter for the
 * local SQS emulator.
 *
 * This is the protocol the older AWS SDKs and the AWS CLI use against SQS: the
 * action and all parameters arrive as `application/x-www-form-urlencoded` body
 * fields (`Action=…&QueueUrl=…&…`), with collections expressed through AWS's
 * flat, 1-based indexed key convention (`MessageAttribute.1.Name`,
 * `SendMessageBatchRequestEntry.1.MessageBody`, …). Responses are AWS XML.
 *
 * The adapter normalises those flat keys into the same nested `{ action,
 * params }` shape that `ops.runOp` consumes (PascalCase keys, `MessageAttributes`
 * map, `Entries` array, …), and renders result objects back to the AWS XML
 * envelope.
 */

import { randomUUID } from 'node:crypto'

const CONTENT_TYPE = 'text/xml'
const XMLNS = 'http://queue.amazonaws.com/doc/2012-11-05/'

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
 * Collect 1-based indexed members of a flat field map under a given prefix.
 * For prefix `MessageAttribute`, returns a map keyed by the index whose values
 * are the per-member sub-field maps (with the `<prefix>.<n>.` removed).
 *
 * @param {Record<string, string>} fields
 * @param {string} prefix - e.g. `'MessageAttribute'`.
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
      // A bare indexed scalar (e.g. `AttributeName.1`): index with no sub-field.
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
 * Fold a flat sub-field map describing message attributes
 * (`<n>.Name`, `<n>.Value.DataType`, `<n>.Value.StringValue`,
 * `<n>.Value.BinaryValue`) into a `{ Name: { DataType, StringValue? } }` map.
 *
 * @param {Record<string, string>} fields - The flat fields, possibly scoped.
 * @param {string} prefix - e.g. `'MessageAttribute'`.
 * @returns {object|undefined} The attributes map, or undefined when none.
 */
function foldMessageAttributes(fields, prefix) {
  const byIndex = collectIndexed(fields, prefix)
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
 * Fold `Attribute.N.Name` / `Attribute.N.Value` pairs into a `{ Name: Value }`
 * map (used by SetQueueAttributes / CreateQueue).
 *
 * @param {Record<string, string>} fields
 * @returns {object|undefined}
 */
function foldAttributeMap(fields) {
  const byIndex = collectIndexed(fields, 'Attribute')
  if (byIndex.size === 0) return undefined

  const map = {}
  for (const sub of byIndex.values()) {
    if (sub.Name !== undefined) map[sub.Name] = sub.Value
  }
  return map
}

/**
 * Fold `AttributeName.N` scalar members into an ordered array of names.
 *
 * @param {Record<string, string>} fields
 * @returns {string[]|undefined}
 */
function foldAttributeNames(fields) {
  const byIndex = collectIndexed(fields, 'AttributeName')
  if (byIndex.size === 0) return undefined
  return orderedByIndex(byIndex).map((sub) => sub[''])
}

/**
 * Fold a batch entry's flat sub-fields into the PascalCase entry object ops
 * expects, including any nested message attributes.
 *
 * @param {Record<string, string>} sub - One entry's scoped sub-fields.
 * @returns {object}
 */
function foldBatchEntry(sub) {
  const entry = {}
  for (const [key, value] of Object.entries(sub)) {
    // Nested members (MessageAttribute.* etc.) are folded separately below.
    if (key.includes('.')) continue
    entry[key] = value
  }

  const messageAttributes = foldMessageAttributes(sub, 'MessageAttribute')
  if (messageAttributes) entry.MessageAttributes = messageAttributes

  return entry
}

/**
 * Fold the batch-entry collection for whichever batch action is present
 * (`SendMessageBatchRequestEntry`, `DeleteMessageBatchRequestEntry`,
 * `ChangeMessageVisibilityBatchRequestEntry`) into an `Entries` array.
 *
 * @param {Record<string, string>} fields
 * @returns {object[]|undefined}
 */
function foldEntries(fields) {
  const prefixes = [
    'SendMessageBatchRequestEntry',
    'DeleteMessageBatchRequestEntry',
    'ChangeMessageVisibilityBatchRequestEntry',
  ]
  for (const prefix of prefixes) {
    const byIndex = collectIndexed(fields, prefix)
    if (byIndex.size === 0) continue
    return orderedByIndex(byIndex).map(foldBatchEntry)
  }
  return undefined
}

/** Flat-field key prefixes whose members are folded into structured params. */
const STRUCTURED_PREFIXES = [
  'MessageAttribute.',
  'Attribute.',
  'AttributeName.',
  'SendMessageBatchRequestEntry.',
  'DeleteMessageBatchRequestEntry.',
  'ChangeMessageVisibilityBatchRequestEntry.',
]

/**
 * Parse a query-protocol SQS request into `{ action, params }`.
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

  const messageAttributes = foldMessageAttributes(fields, 'MessageAttribute')
  if (messageAttributes) params.MessageAttributes = messageAttributes

  const attributes = foldAttributeMap(fields)
  if (attributes) params.Attributes = attributes

  const attributeNames = foldAttributeNames(fields)
  if (attributeNames) params.AttributeNames = attributeNames

  const entries = foldEntries(fields)
  if (entries) params.Entries = entries

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
 * Render a `{ Name, Value }` attribute pair as `<Attribute><Name/><Value/></…>`.
 *
 * @param {string} name
 * @param {string} value
 * @returns {string}
 */
function attributePair(name, value) {
  return `<Attribute><Name>${escapeXml(name)}</Name><Value>${escapeXml(value)}</Value></Attribute>`
}

/**
 * Render a single received message into its `<Message>…</Message>` element.
 *
 * @param {object} message - An AWS-shaped ReceiveMessage message.
 * @returns {string}
 */
function renderMessage(message) {
  const parts = [
    `<MessageId>${escapeXml(message.MessageId)}</MessageId>`,
    `<ReceiptHandle>${escapeXml(message.ReceiptHandle)}</ReceiptHandle>`,
    `<MD5OfBody>${escapeXml(message.MD5OfBody)}</MD5OfBody>`,
    `<Body>${escapeXml(message.Body)}</Body>`,
  ]
  if (message.MD5OfMessageAttributes !== undefined) {
    parts.push(
      `<MD5OfMessageAttributes>${escapeXml(message.MD5OfMessageAttributes)}</MD5OfMessageAttributes>`,
    )
  }
  if (message.Attributes) {
    for (const [name, value] of Object.entries(message.Attributes)) {
      parts.push(attributePair(name, value))
    }
  }
  if (message.MessageAttributes) {
    for (const [name, attribute] of Object.entries(message.MessageAttributes)) {
      const valueParts = [
        `<DataType>${escapeXml(attribute.DataType)}</DataType>`,
      ]
      if (attribute.StringValue !== undefined) {
        valueParts.push(
          `<StringValue>${escapeXml(attribute.StringValue)}</StringValue>`,
        )
      }
      if (attribute.BinaryValue !== undefined) {
        valueParts.push(
          `<BinaryValue>${escapeXml(attribute.BinaryValue)}</BinaryValue>`,
        )
      }
      parts.push(
        `<MessageAttribute><Name>${escapeXml(name)}</Name><Value>${valueParts.join('')}</Value></MessageAttribute>`,
      )
    }
  }
  return `<Message>${parts.join('')}</Message>`
}

/**
 * Render a batch `Successful` / `Failed` entry into its element. Successful
 * entries carry a `SendMessage`-style payload (`<Id>`, `<MessageId>`, …);
 * failed entries carry `<Id>`, `<SenderFault>`, `<Code>`, `<Message>`.
 *
 * @param {string} wrapper - `'SendMessageBatchResultEntry'` etc.
 * @param {object} entry
 * @returns {string}
 */
function renderBatchEntry(wrapper, entry) {
  const inner = Object.entries(entry)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join('')
  return `<${wrapper}>${inner}</${wrapper}>`
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
    case 'ReceiveMessage':
      return (result.Messages ?? []).map(renderMessage).join('')

    case 'ListQueues':
      return (result.QueueUrls ?? [])
        .map((url) => `<QueueUrl>${escapeXml(url)}</QueueUrl>`)
        .join('')

    case 'GetQueueAttributes':
      return Object.entries(result.Attributes ?? {})
        .map(([name, value]) => attributePair(name, value))
        .join('')

    case 'SendMessageBatch':
      return [
        ...(result.Successful ?? []).map((entry) =>
          renderBatchEntry('SendMessageBatchResultEntry', entry),
        ),
        ...(result.Failed ?? []).map((entry) =>
          renderBatchEntry('BatchResultErrorEntry', entry),
        ),
      ].join('')

    case 'DeleteMessageBatch':
      return [
        ...(result.Successful ?? []).map((entry) =>
          renderBatchEntry('DeleteMessageBatchResultEntry', entry),
        ),
        ...(result.Failed ?? []).map((entry) =>
          renderBatchEntry('BatchResultErrorEntry', entry),
        ),
      ].join('')

    case 'ChangeMessageVisibilityBatch':
      return [
        ...(result.Successful ?? []).map((entry) =>
          renderBatchEntry('ChangeMessageVisibilityBatchResultEntry', entry),
        ),
        ...(result.Failed ?? []).map((entry) =>
          renderBatchEntry('BatchResultErrorEntry', entry),
        ),
      ].join('')

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
 * @param {string} action - The SQS action name.
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
 * Serialize an `SqsOpError` into the AWS `ErrorResponse` XML. The `<Type>` is
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
