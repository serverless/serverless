// Mirrors the resolution stream.js has always used for consumer naming.
export default function getStreamNameFromArn(eventSourceArn) {
  if (eventSourceArn['Fn::GetAtt']) {
    return eventSourceArn['Fn::GetAtt'][0]
  } else if (eventSourceArn['Fn::ImportValue']) {
    return eventSourceArn['Fn::ImportValue']
  } else if (eventSourceArn.Ref) {
    return eventSourceArn.Ref
  } else if (eventSourceArn['Fn::Join']) {
    // [0] is the used delimiter, [1] is the array with values
    const name = eventSourceArn['Fn::Join'][1].slice(-1).pop()
    if (name.split('/').length) {
      return name.split('/').pop()
    }
    return name
  }
  return eventSourceArn.split('/')[1]
}
