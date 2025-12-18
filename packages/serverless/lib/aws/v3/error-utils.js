import ServerlessError from '../../serverless-error.js'

export const buildV3ProviderError = (err) => {
  const statusCode = err?.$metadata?.httpStatusCode
  const requestId = err?.$metadata?.requestId
  const code = err?.name || err?.code || 'Error'
  const retryableNames = new Set([
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException',
    'RequestTimeout',
    'NetworkingError',
    'TimeoutError',
    'InternalError',
    'ServiceUnavailable',
  ])
  let retryable =
    Boolean(err?.$retryable?.throttling) ||
    retryableNames.has(code) ||
    (typeof statusCode === 'number' &&
      (statusCode >= 500 || statusCode === 429))
  return Object.assign({}, err, {
    statusCode,
    requestId,
    code,
    retryable,
    original: err,
  })
}

const normalizerPattern = /(?<!^)([A-Z])/g
export const normalizeErrorCodePostfix = (name) =>
  name.replace(normalizerPattern, '_$1').toUpperCase()

export const handleV3Error = (
  err,
  { serviceName, method, requestId, awsLog, log },
) => {
  const providerError = buildV3ProviderError(err)
  let message = err.message || String(providerError.code)
  if (
    message.startsWith('Missing credentials in config') ||
    providerError.code === 'CredentialsProviderError' ||
    /Could not load credentials/i.test(message)
  ) {
    const errorMessage =
      'AWS provider credentials not found. Learn how to set up AWS provider credentials in our docs here: http://slss.io/aws-creds-setup'
    const wrapped = Object.assign(
      new ServerlessError(errorMessage, 'AWS_CREDENTIALS_NOT_FOUND'),
      { providerError: { ...providerError, retryable: false } },
    )
    Object.assign(wrapped, {
      statusCode: providerError.statusCode,
      requestId: providerError.requestId,
    })
    awsLog.debug(
      `request error: #${requestId} - ${serviceName}.${method} [v3]`,
      err,
    )
    if (wrapped.stack) log.debug(`${wrapped.stack}\n${'-'.repeat(100)}`)
    throw wrapped
  }
  const providerErrorCodeExtension = (() => {
    if (typeof providerError.code === 'number')
      return `HTTP_${providerError.code}_ERROR`
    return normalizeErrorCodePostfix(String(providerError.code || 'ERROR'))
  })()
  const wrapped = Object.assign(
    new ServerlessError(
      message,
      `AWS_${normalizeErrorCodePostfix(serviceName)}_${normalizeErrorCodePostfix(
        method,
      )}_${providerErrorCodeExtension}`,
    ),
    { providerError },
  )
  Object.assign(wrapped, {
    statusCode: providerError.statusCode,
    requestId: providerError.requestId,
  })
  awsLog.debug(
    `request error: #${requestId} - ${serviceName}.${method} [v3]`,
    err,
  )
  if (wrapped.stack) log.debug(`${wrapped.stack}\n${'-'.repeat(100)}`)
  throw wrapped
}
