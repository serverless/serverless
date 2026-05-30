/**
 * AWS Lambda Invoke API response envelope shapers.
 *
 * Pure helpers that turn a handler result, a handler error, or an unknown
 * function name into the exact HTTP response the AWS Lambda Invoke API
 * produces, so the AWS SDK `LambdaClient` unmarshals them correctly. Each
 * takes the Hapi response toolkit `h` and returns a configured Hapi response.
 */

/**
 * Shape a successful synchronous Lambda invoke response.
 *
 * Responds with HTTP 200 and the JSON-serialized result as the body (an empty
 * string when the result is `undefined`, so falsy-but-defined values such as
 * `0`, `false`, and `''` still round-trip as JSON). The SDK unmarshals this to
 * `{ StatusCode: 200, Payload: <body bytes>, ExecutedVersion: '$LATEST' }`.
 *
 * @param {unknown} result - The value returned by the invoked handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function toInvokeResponse(result, h) {
  const body = result === undefined ? '' : JSON.stringify(result)

  return h
    .response(body)
    .code(200)
    .type('application/json')
    .header('X-Amz-Executed-Version', '$LATEST')
}

/**
 * Shape a synchronous Lambda invoke handler-error response.
 *
 * AWS returns handler errors on an HTTP 200 carrying the
 * `X-Amz-Function-Error: Unhandled` header; the body is the error envelope.
 * The SDK surfaces this as
 * `{ StatusCode: 200, FunctionError: 'Unhandled', Payload: <error JSON> }`.
 *
 * @param {unknown} err - The error thrown by the invoked handler.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function toInvokeError(err, h) {
  const body = JSON.stringify({
    errorType: err?.name ?? 'Error',
    errorMessage: err?.message ?? String(err),
    trace: typeof err?.stack === 'string' ? err.stack.split('\n') : [],
  })

  return h
    .response(body)
    .code(200)
    .type('application/json')
    .header('X-Amz-Function-Error', 'Unhandled')
    .header('X-Amz-Executed-Version', '$LATEST')
}

/**
 * Shape an InvalidParameterValueException response for an unsupported
 * invocation type.
 *
 * Responds with HTTP 400 and the
 * `x-amzn-ErrorType: InvalidParameterValueException` header so the SDK throws
 * `InvalidParameterValueException`, matching real Lambda when the
 * `X-Amz-Invocation-Type` is not one it accepts.
 *
 * @param {string} message - Human-readable parameter error.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function toInvalidParameterValue(message, h) {
  const body = JSON.stringify({ Type: 'User', Message: message })

  return h
    .response(body)
    .code(400)
    .type('application/json')
    .header('x-amzn-ErrorType', 'InvalidParameterValueException')
}

/**
 * Shape a ResourceNotFoundException response for an unknown function name.
 *
 * Responds with HTTP 404 and the `x-amzn-ErrorType: ResourceNotFoundException`
 * header so the SDK throws `ResourceNotFoundException`.
 *
 * @param {string} functionName - The requested (unresolved) function name.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @returns {import('@hapi/hapi').ResponseObject}
 */
export function toNotFound(functionName, h) {
  const body = JSON.stringify({
    Type: 'User',
    Message: `Function not found: ${functionName}`,
  })

  return h
    .response(body)
    .code(404)
    .type('application/json')
    .header('x-amzn-ErrorType', 'ResourceNotFoundException')
}
