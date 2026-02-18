/**
 * Calculator Lambda function -- exposed as a Gateway tool.
 *
 * Performs basic arithmetic on two numbers via a Gateway tool.
 * The agent can break complex calculations into multiple calls.
 */

/**
 * Perform basic arithmetic on two numbers.
 * Accepts expressions in the form "number operator number" (e.g. "2 + 3", "10 / 5").
 * For complex calculations the agent can decompose them into multiple calls.
 */
function safeCalculate(expression) {
  const match = expression.match(/^\s*([\d.]+)\s*([+\-*/])\s*([\d.]+)\s*$/)
  if (!match) {
    throw new Error(
      'Use format: "number operator number" (e.g., "2 + 3", "10 / 5")',
    )
  }

  const [, a, op, b] = match
  const left = parseFloat(a)
  const right = parseFloat(b)

  switch (op) {
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return left * right
    case '/':
      if (right === 0) throw new Error('Division by zero')
      return left / right
    default:
      throw new Error(`Unknown operator: ${op}`)
  }
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
