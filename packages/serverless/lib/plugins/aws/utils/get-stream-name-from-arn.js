import ServerlessError from '../../../serverless-error.js'

// Mirrors the resolution stream.js has always used for consumer naming.
export default function getStreamNameFromArn(eventSourceArn) {
  let result
  if (eventSourceArn['Fn::GetAtt']) {
    result = eventSourceArn['Fn::GetAtt'][0]
  } else if (eventSourceArn['Fn::ImportValue']) {
    result = eventSourceArn['Fn::ImportValue']
  } else if (eventSourceArn.Ref) {
    result = eventSourceArn.Ref
  } else if (eventSourceArn['Fn::Join']) {
    // [0] is the used delimiter, [1] is the array with values
    const name = eventSourceArn['Fn::Join'][1].slice(-1).pop()
    result = typeof name === 'string' ? name.split('/').pop() : name
  } else if (typeof eventSourceArn === 'string') {
    result = eventSourceArn.split('/')[1]
  }

  // Intrinsic functions may be nested (e.g. an Fn::ImportValue whose value is
  // itself a Fn::Join); resolve them recursively.
  if (result != null && typeof result === 'object') {
    return getStreamNameFromArn(result)
  }
  if (typeof result !== 'string' || !result) {
    throw new ServerlessError(
      `Cannot resolve stream name from provided ARN configuration: ${JSON.stringify(
        eventSourceArn,
      )}`,
      'STREAM_NAME_RESOLUTION_ERROR',
    )
  }
  return result
}
