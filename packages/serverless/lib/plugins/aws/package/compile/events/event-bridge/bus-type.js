const NEW_BUS_RESOURCE_TYPE = 'AWS::EventsV2::EventBus'
const NEW_BUS_ARN_MARKER = ':event-busv2/'
const NEW_BUS_ARN_PATTERN =
  /^arn:[^:]+:events:([^:]+):(\d{12}):event-busv2\/([^/]+)\/[a-z0-9]+$/

/**
 * Decides whether an `eventBridge` event's `eventBus` targets an EventBridge
 * Custom Event Bus ('subscriber') or a Classic event bus ('rule').
 *
 * @param {string|object|undefined} eventBus - the event's `eventBus` value
 * @param {object|undefined} resources - the service's `resources.Resources`
 * @returns {'subscriber'|'rule'}
 */
const classifyEventBus = (eventBus, resources) => {
  if (typeof eventBus === 'string') {
    return eventBus.includes(NEW_BUS_ARN_MARKER) ? 'subscriber' : 'rule'
  }
  if (!eventBus || typeof eventBus !== 'object') return 'rule'

  if (typeof eventBus.Ref === 'string') {
    const resource = resources?.[eventBus.Ref]
    return resource?.Type === NEW_BUS_RESOURCE_TYPE ? 'subscriber' : 'rule'
  }

  const getAtt = eventBus['Fn::GetAtt']
  if (Array.isArray(getAtt) && getAtt[1] === 'EventBusArn') {
    return 'subscriber'
  }

  return 'rule'
}

/**
 * Parses a Custom Event Bus ARN.
 *
 * @param {unknown} value
 * @returns {{ region: string, accountId: string, name: string } | null}
 */
const parseEventBusArn = (value) => {
  if (typeof value !== 'string') return null
  const match = NEW_BUS_ARN_PATTERN.exec(value)
  if (!match) return null
  const [, region, accountId, name] = match
  return { region, accountId, name }
}

export { classifyEventBus, parseEventBusArn }
