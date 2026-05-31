/**
 * EventBridge target input transformation.
 *
 * A target on a rule may reshape the event before it reaches the target, in
 * one of three mutually-exclusive ways (AWS evaluates them in this precedence):
 *
 *   - `Input`: a constant JSON string. The event is ignored; the parsed value
 *     is delivered. A string that is not valid JSON is delivered verbatim.
 *   - `InputPath`: a JSONPath into the event. The matched sub-tree is delivered
 *     (null when the path matches nothing).
 *   - `InputTransformer`: `{ InputPathsMap, InputTemplate }`. Each named
 *     variable is resolved by JSONPath against the event, substituted into the
 *     template (everywhere it appears as `<var>`), and the filled template is
 *     delivered — parsed as JSON when it parses, otherwise as a plain string.
 *     AWS auto-quotes a resolved string value (it is inserted JSON-encoded), so
 *     an unquoted `{"x": <var>}` template yields valid JSON; numbers, booleans,
 *     objects and arrays are likewise inserted via `JSON.stringify`. Several
 *     reserved variables are also supported, threaded from the delivering rule:
 *       - `<aws.events.event.json>`  — the whole event as raw JSON.
 *       - `<aws.events.event>`       — the event without its `detail` key, as
 *         raw JSON.
 *       - `<aws.events.rule-arn>`    — the delivering rule's ARN.
 *       - `<aws.events.rule-name>`   — the delivering rule's name.
 *       - `<aws.events.ingestion-time>` — the ingestion time (falling back to
 *         the event's `time`).
 *     The two `event` reserved variables insert already-valid raw JSON and are
 *     never re-encoded; the others are ordinary string values and are quoted.
 *
 * When none of the three is configured the whole event is delivered unchanged.
 */

import { jsonPath } from '../../app-server/rest-api/velocity/json-path.js'

/** Reserved InputTransformer variable: the entire event as a JSON string. */
const RESERVED_EVENT_JSON = 'aws.events.event.json'
/** Reserved InputTransformer variable: the event without its `detail` key. */
const RESERVED_EVENT = 'aws.events.event'
/** Reserved InputTransformer variable: the delivering rule's ARN. */
const RESERVED_RULE_ARN = 'aws.events.rule-arn'
/** Reserved InputTransformer variable: the delivering rule's name. */
const RESERVED_RULE_NAME = 'aws.events.rule-name'
/** Reserved InputTransformer variable: the event ingestion time. */
const RESERVED_INGESTION_TIME = 'aws.events.ingestion-time'

/**
 * Apply a target's input transform to an event.
 *
 * @param {object} event - The EventBridge event being delivered.
 * @param {{
 *   input?: string | null,
 *   inputPath?: string | null,
 *   inputTransformer?: { InputPathsMap?: object, InputTemplate?: string } | null,
 * }} [config] - The target's input configuration.
 * @param {{ ruleArn?: string, ruleName?: string, ingestionTime?: string }} [context]
 *   The delivering rule's metadata, used to fill the reserved variables.
 * @returns {unknown} The payload to deliver to the target.
 */
export function applyInputTransform(event, config = {}, context = {}) {
  const { input, inputPath, inputTransformer } = config ?? {}

  if (input !== undefined && input !== null) {
    return parseJsonOrRaw(input)
  }

  if (inputPath !== undefined && inputPath !== null) {
    const extracted = jsonPath(event, inputPath)
    // EventBridge delivers `null` (not `undefined`) when InputPath misses.
    return extracted === undefined ? null : extracted
  }

  if (inputTransformer !== undefined && inputTransformer !== null) {
    return applyInputTransformer(event, inputTransformer, context ?? {})
  }

  return event
}

/**
 * Resolve an InputTransformer against the event: substitute every mapped
 * variable into the template, then parse the result as JSON when possible.
 *
 * @param {object} event
 * @param {{ InputPathsMap?: object, InputTemplate?: string }} transformer
 * @param {{ ruleArn?: string, ruleName?: string, ingestionTime?: string }} context
 * @returns {unknown}
 */
function applyInputTransformer(event, transformer, context) {
  const pathsMap = transformer?.InputPathsMap ?? {}
  let template = transformer?.InputTemplate ?? ''

  for (const [name, path] of Object.entries(pathsMap)) {
    const resolved = jsonPath(event, path)
    template = substituteVar(template, name, encodeVar(resolved))
  }

  // Reserved variables, always available regardless of the paths map. The two
  // `event` forms are inserted as already-valid raw JSON (never re-encoded);
  // the others are ordinary string values and are auto-quoted like any string.
  const { detail, ...eventWithoutDetail } = event
  template = substituteVar(template, RESERVED_EVENT_JSON, JSON.stringify(event))
  template = substituteVar(
    template,
    RESERVED_EVENT,
    JSON.stringify(eventWithoutDetail),
  )
  template = substituteVar(
    template,
    RESERVED_RULE_ARN,
    encodeVar(context.ruleArn),
  )
  template = substituteVar(
    template,
    RESERVED_RULE_NAME,
    encodeVar(context.ruleName),
  )
  template = substituteVar(
    template,
    RESERVED_INGESTION_TIME,
    encodeVar(context.ingestionTime ?? event.time),
  )

  return parseJsonOrRaw(template)
}

/**
 * Replace every `<name>` occurrence in the template with the replacement.
 *
 * @param {string} template
 * @param {string} name
 * @param {string} replacement
 * @returns {string}
 */
function substituteVar(template, name, replacement) {
  return template.split(`<${name}>`).join(replacement)
}

/**
 * Encode a resolved JSONPath / reserved value for insertion into the template.
 * An absent value becomes the empty string; everything else is inserted
 * `JSON.stringify`-encoded — a string is auto-quoted (so an unquoted `<var>`
 * yields valid JSON), and numbers / booleans / objects / arrays land as their
 * JSON form. The reserved `event` variables bypass this (they insert raw JSON
 * directly) so they are not double-encoded.
 *
 * @param {unknown} value
 * @returns {string}
 */
function encodeVar(value) {
  if (value === undefined || value === null) return ''
  return JSON.stringify(value)
}

/**
 * Parse a string as JSON, falling back to the raw string when it does not
 * parse.
 *
 * @param {string} text
 * @returns {unknown}
 */
function parseJsonOrRaw(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
