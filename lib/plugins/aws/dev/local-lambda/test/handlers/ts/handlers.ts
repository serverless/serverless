export const hello = async () => {
  console.log('This log is from the "hello" .ts handler')

  return {
    statusCode: 200,
    body: 'Hello',
  }
}

export const event = async (event: any) => {
  console.log('This log is from the "event" .ts handler')

  return {
    statusCode: 200,
    body: event,
  }
}

export const environment = async () => {
  console.log('This log is from the "environment" .ts handler')

  return {
    statusCode: 200,
    body: process.env.FOO,
  }
}

export const error = async () => {
  console.log('This log is from the "error" .ts handler')
  throw new Error('This error should not fail the test')
}

export const context = async (event: any, context: any) => {
  console.log('This log is from the "context" .ts handler')

  const contextWithoutFunctions = Object.keys(context)
    .filter((key: string) => typeof context[key] !== 'function')
    .reduce((acc: any, key: string) => {
      acc[key] = context[key]
      return acc
    }, {})

  return contextWithoutFunctions
}

export const callback = (event: any, context: any, callback: any) => {
  console.log('This log is from the "callback" .ts handler')

  callback(null, 'Hello')
}
