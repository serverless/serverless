// Registry entries for the `eventbridge` AWS service (alias `events`).

/**
 * Events::Rule's PhysicalResourceId is the rule name on the default bus.
 * CloudFormation's `Ref` doc only defines the bare name, but rules on a
 * CUSTOM bus have been observed to return `<busName>|<ruleName>` instead
 * (undocumented -- handled defensively here). If the id contains a `|`,
 * split it into EventBusName + Name; otherwise treat the whole id as the
 * Name on the default bus (no EventBusName override needed).
 */
function eventRuleIdentifier(stackResource) {
  const id = stackResource.PhysicalResourceId
  if (id.includes('|')) {
    const [busName, ruleName] = id.split('|')
    return { Name: ruleName, EventBusName: busName }
  }
  return { Name: id }
}

const eventRuleEntry = {
  cfnType: 'AWS::Events::Rule',
  awsService: 'eventbridge',
  category: 'events',
  engineClient: 'eventbridge',
  identifier: eventRuleIdentifier,
  calls: [
    // Name/EventBusName both come from the identifier object -- no `input`
    // needed since its keys already match DescribeRule's input shape.
    { key: 'rule', method: 'DescribeRule' },
    {
      key: 'targets',
      method: 'ListTargetsByRule',
      paginate: true,
      // ListTargetsByRule wants `Rule` (not `Name`) for the rule name, plus
      // the same optional EventBusName -- remap from the identifier.
      params: (identifier) => ({
        Rule: identifier.Name,
        ...(identifier.EventBusName
          ? { EventBusName: identifier.EventBusName }
          : {}),
      }),
    },
  ],
}

const eventBusEntry = {
  cfnType: 'AWS::Events::EventBus',
  awsService: 'eventbridge',
  category: 'events',
  engineClient: 'eventbridge',
  // PhysicalResourceId is the bus name as-is.
  identifier: (stackResource) => stackResource.PhysicalResourceId,
  calls: [{ key: 'eventBus', method: 'DescribeEventBus', input: 'Name' }],
}

export const eventbridgeRegistryEntries = [eventRuleEntry, eventBusEntry]
