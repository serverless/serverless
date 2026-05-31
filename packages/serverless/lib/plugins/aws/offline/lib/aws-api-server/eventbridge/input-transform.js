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
 *     The reserved `<aws.events.event.json>` variable resolves to the whole
 *     event serialized as JSON.
 *
 * When none of the three is configured the whole event is delivered unchanged.
 */

import { jsonPath } from '../../app-server/rest-api/velocity/json-path.js'

/** Reserved InputTransformer variable: the entire event as a JSON string. */
const RESERVED_EVENT_JSON = 'aws.events.event.json'

/**
 * Apply a target's input transform to an event.
 *
 * @param {object} event - The EventBridge event being delivered.
 * @param {{
 *   input?: string | null,
 *   inputPath?: string | null,
 *   inputTransformer?: { InputPathsMap?: object, InputTemplate?: string } | null,
 * }} [config] - The target's input configuration.
 * @returns {unknown} The payload to deliver to the target.
 */
export function applyInputTransform(event, config = {}) {
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
    return applyInputTransformer(event, inputTransformer)
  }

  return event
}

/**
 * Resolve an InputTransformer against the event: substitute every mapped
 * variable into the template, then parse the result as JSON when possible.
 *
 * @param {object} event
 * @param {{ InputPathsMap?: object, InputTemplate?: string }} transformer
 * @returns {unknown}
 */
function applyInputTransformer(event, transformer) {
  const pathsMap = transformer?.InputPathsMap ?? {}
  let template = transformer?.InputTemplate ?? ''

  for (const [name, path] of Object.entries(pathsMap)) {
    const resolved = jsonPath(event, path)
    template = substituteVar(template, name, stringifyVar(resolved))
  }

  // The reserved whole-event variable is always available, regardless of the
  // paths map.
  template = substituteVar(template, RESERVED_EVENT_JSON, JSON.stringify(event))

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
 * Coerce a resolved JSONPath value into the string the template expects: an
 * absent value becomes the empty string, a string stays as-is, anything else
 * is serialized as JSON.
 *
 * @param {unknown} value
 * @returns {string}
 */
function stringifyVar(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
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
