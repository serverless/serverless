/**
 * Calculator Lambda function - exposed as a Gateway tool.
 *
 * This function evaluates mathematical expressions safely.
 */

export const handler = async (event) => {
  console.log(`Calculator invoked with event: ${JSON.stringify(event)}`)

  let expression = ''

  if (typeof event === 'string') {
    event = JSON.parse(event)
  }

  // Gateway may wrap the input in a 'body' field
  if (event.body) {
    const body =
      typeof event.body === 'string' ? JSON.parse(event.body) : event.body
    expression = body.expression || ''
  } else {
    expression = event.expression || ''
  }

  if (!expression) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing expression parameter' }),
    }
  }

  try {
    const result = safeCalculate(expression)
    console.log(`Calculator result: ${result}`)
    return {
      statusCode: 200,
      body: JSON.stringify({ result, expression }),
    }
  } catch (err) {
    console.log(`Calculator error: ${err.message}`)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message, expression }),
    }
  }
}

/**
 * Safely evaluate a mathematical expression.
 * Supports basic arithmetic and common math functions.
 */
function safeCalculate(expression) {
  // Replace ^ with ** for exponentiation
  const expr = expression.replace(/\^/g, '**')

  // Only allow safe characters: digits, operators, parentheses, dots, spaces, and function names
  if (
    !/^[\d\s+\-*/().,%eE]+$/.test(expr) &&
    !/^[\w\s+\-*/().,%]+$/.test(expr)
  ) {
    throw new Error(`Invalid expression: ${expression}`)
  }

  // Create a safe math context
  const mathFunctions = {
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
    pi: Math.PI,
    e: Math.E,
  }

  // Build a function with math context
  const keys = Object.keys(mathFunctions)
  const values = Object.values(mathFunctions)

  // eslint-disable-next-line no-new-func
  const fn = new Function(...keys, `"use strict"; return (${expr})`)
  const result = fn(...values)

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error(
      `Expression did not evaluate to a finite number: ${expression}`,
    )
  }

  return result
}
