import { createTopicStore } from '../../../../../../../../../lib/plugins/aws/offline/lib/aws-api-server/sns/topic-store.js'

const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:MyTopic'
const FIFO_ARN = 'arn:aws:sns:us-east-1:000000000000:MyTopic.fifo'
const OTHER_ARN = 'arn:aws:sns:us-east-1:000000000000:OtherTopic'

const LAMBDA_TARGET = { kind: 'lambda', functionKey: 'hello' }
const SQS_TARGET = {
  kind: 'sqs',
  queueUrl: 'http://localhost:4566/000000000000/MyQueue',
}

// ===========================================================================
// Topics
// ===========================================================================

it('1. ensureTopic creates a topic record and is idempotent', () => {
  const store = createTopicStore()
  const first = store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const second = store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  expect(first.arn).toBe(TOPIC_ARN)
  expect(first.name).toBe('MyTopic')
  expect(store.listTopics()).toHaveLength(1)
  // Re-ensuring returns the same (first-wins) record.
  expect(second).toBe(first)
})

it('2. ensureTopic records the FIFO flag', () => {
  const store = createTopicStore()
  const topic = store.ensureTopic(FIFO_ARN, {
    name: 'MyTopic.fifo',
    fifo: true,
  })
  expect(topic.fifo).toBe(true)
  const standard = store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  expect(standard.fifo).toBe(false)
})

it('3. ensureTopic stores attributes and displayName', () => {
  const store = createTopicStore()
  const topic = store.ensureTopic(TOPIC_ARN, {
    name: 'MyTopic',
    displayName: 'My Topic',
    attributes: { DeliveryPolicy: '{}' },
  })
  expect(topic.displayName).toBe('My Topic')
  expect(topic.attributes.DeliveryPolicy).toBe('{}')
})

it('4. getTopicByArn and getTopicByName resolve a topic', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  expect(store.getTopicByArn(TOPIC_ARN).name).toBe('MyTopic')
  expect(store.getTopicByName('MyTopic').arn).toBe(TOPIC_ARN)
  expect(store.getTopicByArn('arn:aws:sns:us-east-1:000000000000:Nope')).toBe(
    undefined,
  )
  expect(store.getTopicByName('Nope')).toBe(undefined)
})

it('5. listTopics returns every topic', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.ensureTopic(OTHER_ARN, { name: 'OtherTopic' })
  expect(
    store
      .listTopics()
      .map((t) => t.arn)
      .sort(),
  ).toEqual([OTHER_ARN, TOPIC_ARN].sort())
})

it('6. deleteTopic removes the topic and its subscriptions', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.subscribe(TOPIC_ARN, { protocol: 'lambda', target: LAMBDA_TARGET })
  store.deleteTopic(TOPIC_ARN)
  expect(store.getTopicByArn(TOPIC_ARN)).toBe(undefined)
  expect(store.listSubscriptionsByTopic(TOPIC_ARN)).toHaveLength(0)
})

// ===========================================================================
// Topic attributes
// ===========================================================================

it('7. get/setTopicAttributes round-trips an attribute', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.setTopicAttributes(TOPIC_ARN, 'DisplayName', 'Renamed')
  const attrs = store.getTopicAttributes(TOPIC_ARN)
  expect(attrs.DisplayName).toBe('Renamed')
  expect(attrs.TopicArn).toBe(TOPIC_ARN)
})

// ===========================================================================
// Subscriptions
// ===========================================================================

it('8. subscribe returns a synthesised subscription ARN under the topic ARN', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    target: LAMBDA_TARGET,
  })
  expect(typeof arn).toBe('string')
  expect(arn.startsWith(`${TOPIC_ARN}:`)).toBe(true)
})

it('9. getSubscription returns the stored subscription record', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn:aws:lambda:us-east-1:000000000000:function:hello',
    target: LAMBDA_TARGET,
  })
  const sub = store.getSubscription(arn)
  expect(sub.arn).toBe(arn)
  expect(sub.topicArn).toBe(TOPIC_ARN)
  expect(sub.protocol).toBe('lambda')
  expect(sub.target).toEqual(LAMBDA_TARGET)
})

it('10. subscribe carries through the filter policy and scope', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const filterPolicy = { store: ['example_corp'] }
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    target: SQS_TARGET,
    filterPolicy,
    filterPolicyScope: 'MessageBody',
    rawMessageDelivery: true,
  })
  const sub = store.getSubscription(arn)
  expect(sub.filterPolicy).toEqual(filterPolicy)
  expect(sub.filterPolicyScope).toBe('MessageBody')
  expect(sub.rawMessageDelivery).toBe(true)
})

it('11. listSubscriptions returns all subscriptions across topics', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.ensureTopic(OTHER_ARN, { name: 'OtherTopic' })
  store.subscribe(TOPIC_ARN, { protocol: 'lambda', target: LAMBDA_TARGET })
  store.subscribe(OTHER_ARN, { protocol: 'sqs', target: SQS_TARGET })
  expect(store.listSubscriptions()).toHaveLength(2)
})

it('12. listSubscriptionsByTopic isolates subscriptions per topic', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  store.ensureTopic(OTHER_ARN, { name: 'OtherTopic' })
  store.subscribe(TOPIC_ARN, { protocol: 'lambda', target: LAMBDA_TARGET })
  store.subscribe(TOPIC_ARN, { protocol: 'sqs', target: SQS_TARGET })
  store.subscribe(OTHER_ARN, { protocol: 'sqs', target: SQS_TARGET })

  expect(store.listSubscriptionsByTopic(TOPIC_ARN)).toHaveLength(2)
  expect(store.listSubscriptionsByTopic(OTHER_ARN)).toHaveLength(1)
  for (const sub of store.listSubscriptionsByTopic(TOPIC_ARN)) {
    expect(sub.topicArn).toBe(TOPIC_ARN)
  }
})

it('13. unsubscribe removes a single subscription', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    target: LAMBDA_TARGET,
  })
  store.unsubscribe(arn)
  expect(store.getSubscription(arn)).toBe(undefined)
  expect(store.listSubscriptions()).toHaveLength(0)
})

it('14. unsubscribe is a no-op for an unknown ARN', () => {
  const store = createTopicStore()
  expect(() => store.unsubscribe('arn:aws:sns:...:nope:xyz')).not.toThrow()
})

// ===========================================================================
// Subscription attributes
// ===========================================================================

it('15. getSubscriptionAttributes exposes the AWS-shaped attribute map', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'lambda',
    endpoint: 'arn:aws:lambda:us-east-1:000000000000:function:hello',
    target: LAMBDA_TARGET,
  })
  const attrs = store.getSubscriptionAttributes(arn)
  expect(attrs.SubscriptionArn).toBe(arn)
  expect(attrs.TopicArn).toBe(TOPIC_ARN)
  expect(attrs.Protocol).toBe('lambda')
  expect(attrs.Endpoint).toBe(
    'arn:aws:lambda:us-east-1:000000000000:function:hello',
  )
})

it('16. setSubscriptionAttributes parses a FilterPolicy JSON string', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    target: SQS_TARGET,
  })
  store.setSubscriptionAttributes(
    arn,
    'FilterPolicy',
    JSON.stringify({ store: ['example_corp'] }),
  )
  expect(store.getSubscription(arn).filterPolicy).toEqual({
    store: ['example_corp'],
  })
})

it('17. setSubscriptionAttributes sets the FilterPolicyScope', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    target: SQS_TARGET,
  })
  store.setSubscriptionAttributes(arn, 'FilterPolicyScope', 'MessageBody')
  expect(store.getSubscription(arn).filterPolicyScope).toBe('MessageBody')
})

it('18. setSubscriptionAttributes toggles RawMessageDelivery from a string', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    target: SQS_TARGET,
  })
  store.setSubscriptionAttributes(arn, 'RawMessageDelivery', 'true')
  expect(store.getSubscription(arn).rawMessageDelivery).toBe(true)
  store.setSubscriptionAttributes(arn, 'RawMessageDelivery', 'false')
  expect(store.getSubscription(arn).rawMessageDelivery).toBe(false)
})

it('19. clearing FilterPolicy with an empty string removes it', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    target: SQS_TARGET,
    filterPolicy: { store: ['example_corp'] },
  })
  store.setSubscriptionAttributes(arn, 'FilterPolicy', '')
  expect(store.getSubscription(arn).filterPolicy).toBe(null)
})

it('20. getSubscriptionAttributes reflects a FilterPolicy as a JSON string', () => {
  const store = createTopicStore()
  store.ensureTopic(TOPIC_ARN, { name: 'MyTopic' })
  const arn = store.subscribe(TOPIC_ARN, {
    protocol: 'sqs',
    target: SQS_TARGET,
    filterPolicy: { store: ['example_corp'] },
    filterPolicyScope: 'MessageBody',
  })
  const attrs = store.getSubscriptionAttributes(arn)
  expect(JSON.parse(attrs.FilterPolicy)).toEqual({ store: ['example_corp'] })
  expect(attrs.FilterPolicyScope).toBe('MessageBody')
})
