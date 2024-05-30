module.exports.hello = async () => {
  console.log('This log is from the "hello" .js handler')

  return {
    statusCode: 200,
    body: 'Hello',
  }
}

module.exports.event = async (event) => {
  console.log('This log is from the "event" .js handler')

  return {
    statusCode: 200,
    body: event,
  }
}

module.exports.environment = async () => {
  console.log('This log is from the "environment" .js handler')

  return {
    statusCode: 200,
    body: process.env.FOO,
  }
}

module.exports.error = async () => {
  console.log('This log is from the "error" .js handler')
  throw new Error('This error should not fail the test')
}

module.exports.context = async (event, context) => {
  console.log('This log is from the "context" .js handler')

  const contextWithoutFunctions = Object.keys(context)
    .filter((key) => typeof context[key] !== 'function')
    .reduce((acc, key) => {
      acc[key] = context[key]
      return acc
    }, {})

  return contextWithoutFunctions
}

module.exports.callback = (event, context, callback) => {
  console.log('This log is from the "callback" .js handler')

  callback(null, 'Hello')

  return 'This should not be returned'
}
