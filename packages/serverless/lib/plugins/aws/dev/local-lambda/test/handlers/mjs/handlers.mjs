export const hello = async () => {
  console.log('This log is from the "hello" .mjs handler')

  return {
    statusCode: 200,
    body: 'Hello',
  }
}

export const event = async (event) => {
  console.log('This log is from the "event" .mjs handler')

  return {
    statusCode: 200,
    body: event,
  }
}

export const environment = async () => {
  console.log('This log is from the "environment" .mjs handler')

  return {
    statusCode: 200,
    body: process.env.FOO,
  }
}

export const error = async () => {
  console.log('This log is from the "error" .mjs handler')
  throw new Error('This error should not fail the test')
}

export const context = async (event, context) => {
  console.log('This log is from the "context" .mjs handler')

  const contextWithoutFunctions = Object.keys(context)
    .filter((key) => typeof context[key] !== 'function')
    .reduce((acc, key) => {
      acc[key] = context[key]
      return acc
    }, {})

  return contextWithoutFunctions
}

export const callback = (event, context, callback) => {
  console.log('This log is from the "callback" .mjs handler')

  callback(null, 'Hello')
}
