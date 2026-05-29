/**
 * Wraps the `velocityjs` library with the typed-return + deep-object
 * rendering REST API mapping templates need.
 *
 * velocityjs always returns a string; AWS API Gateway treats certain
 * string results as typed values (`"null"` -> JSON null; `"true"` /
 * `"false"` -> booleans; anything parseable as JSON -> the parsed object
 * or array). This wrapper does that translation so callers can use the
 * returned value directly as the Lambda event or response body.
 *
 * Renders in silent mode (`true` as the third arg to `.render()`) and
 * with HTML escaping off (`{ escape: false }`) -- matches APIGW behavior.
 */

import velocityjs from 'velocityjs'
import { runInPollutedScope } from './java-helpers.js'

/**
 * Render a single velocity-template string and convert the result to
 * a typed JavaScript value where possible.
 *
 * @param {string} template
 * @param {object} context  The `{ context, input, util }` map (and optional
 *                          `$stageVariables`) passed to velocityjs.
 * @returns {unknown}
 */
export function renderVelocityString(template, context) {
  const rendered = runInPollutedScope(() =>
    new velocityjs.Compile(velocityjs.parse(template), {
      escape: false,
    }).render(context, null, true),
  )

  switch (rendered) {
    case 'undefined':
      return undefined
    case 'null':
      return null
    case 'true':
      return true
    case 'false':
      return false
    default:
      return tryParseJson(rendered)
  }
}

/**
 * Render a velocity template that is either an object (deep-walked, each
 * string leaf rendered in place) or a string (rendered as a whole, then
 * JSON-parsed -- falls back to an empty object if the result isn't
 * object-shaped).
 *
 * @param {object | string} template
 * @param {object} context
 * @returns {object}
 */
export function renderVelocityTemplateObject(template, context) {
  let toProcess = template
  if (typeof toProcess === 'string') {
    toProcess = tryParseJson(toProcess)
  }

  if (isPlainObject(toProcess)) {
    const result = {}
    for (const [key, value] of Object.entries(toProcess)) {
      if (typeof value === 'string') {
        result[key] = renderVelocityString(value, context)
      } else if (isPlainObject(value)) {
        result[key] = renderVelocityTemplateObject(value, context)
      } else {
        result[key] = value
      }
    }
    return result
  }

  if (typeof toProcess === 'string') {
    const alternative = tryParseJson(
      String(
        runInPollutedScope(() =>
          new velocityjs.Compile(velocityjs.parse(toProcess), {
            escape: false,
          }).render(context, null, true),
        ),
      ),
    )
    return isPlainObject(alternative) ? alternative : {}
  }

  return {}
}

function tryParseJson(maybeJson) {
  try {
    return JSON.parse(maybeJson)
  } catch {
    return maybeJson
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}
