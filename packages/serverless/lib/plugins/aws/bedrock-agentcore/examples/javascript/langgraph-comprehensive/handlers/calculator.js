/**
 * Calculator Lambda function -- exposed as a Gateway tool.
 *
 * Evaluates mathematical expressions safely using a restricted evaluator.
 * Supports basic arithmetic, math functions, and constants.
 */

const FUNCTIONS = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  log: Math.log,
  log10: Math.log10,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  pow: Math.pow,
}

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
}

/**
 * Safely evaluate a mathematical expression.
 *
 * Replaces known function names and constants with their Math equivalents,
 * validates the expression contains only safe characters, then evaluates it.
 */
function safeCalculate(expression) {
  let expr = expression.replace(/\^/g, '**')

  for (const [name, value] of Object.entries(CONSTANTS)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'gi'), String(value))
  }

  for (const name of Object.keys(FUNCTIONS)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'gi'), `Math.${name}`)
  }

  if (!/^[\d\s+\-*/().,%eE<>Math.a-z]+$/.test(expr)) {
    throw new Error(`Unsafe characters in expression: ${expression}`)
  }

  const result = new Function(`"use strict"; return (${expr})`)()

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error(
      `Expression did not evaluate to a finite number: ${expression}`,
    )
  }

  return result
}

export const handler = async (event) => {
  console.log(`Calculator invoked with event: ${JSON.stringify(event)}`)

  let body = event
  if (typeof event === 'string') {
    body = JSON.parse(event)
  }

  if (event.body) {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  }

  const expression = body.expression || ''

  if (!expression) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing expression parameter' }),
    }
  }

  try {
    const result = safeCalculate(expression)
    const response = { result, expression }
    console.log(`Calculator result: ${JSON.stringify(response)}`)
    return {
      statusCode: 200,
      body: JSON.stringify(response),
    }
  } catch (err) {
    console.error(`Calculator error: ${err.message}`)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message, expression }),
    }
  }
}
