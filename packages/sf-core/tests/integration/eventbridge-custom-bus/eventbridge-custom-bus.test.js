import path from 'path'
import url from 'url'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import {
  CloudFormationClient,
  DescribeStacksCommand,
  ListStackResourcesCommand,
} from '@aws-sdk/client-cloudformation'
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  DescribeSubscriberCommand,
  EventBridgeV2Client,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridgev2'
import { jest } from '@jest/globals'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../utils/runSfCore'
import { TEST_REGION } from '../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SOURCE = 'sfc.integration'
const DELIVERY_MARKER = 'EB_DELIVERY'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TRANSIENT_ERROR_NAMES = new Set([
  'ThrottlingException',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'ServiceUnavailableException',
  'InternalServerError',
  'InternalServerException',
])

// Throttling and 5xx responses that outlast the SDK's own retries.
const isTransient = (error) =>
  Boolean(error?.$retryable) ||
  TRANSIENT_ERROR_NAMES.has(error?.name) ||
  error?.$metadata?.httpStatusCode === 429 ||
  error?.$metadata?.httpStatusCode >= 500

/**
 * Calls fn() until predicate(result) is true or maxMs has passed, and throws
 * with the last result on timeout. Deliveries reach CloudWatch Logs a few
 * seconds after the invocation, so every read is polled. FilterLogEvents
 * allows few requests per second per account, so a transient AWS error is
 * retried at the next poll, up to maxTransientErrors in a row; any other
 * error ends the poll at once.
 */
const pollUntil = async (
  fn,
  predicate,
  {
    intervalMs = 5000,
    maxMs = 180000,
    maxTransientErrors = 5,
    label = 'condition',
  } = {},
) => {
  const deadline = Date.now() + maxMs
  let last
  let lastError
  let transientErrors = 0
  while (Date.now() < deadline) {
    try {
      last = await fn()
      lastError = undefined
      transientErrors = 0
    } catch (error) {
      transientErrors += 1
      if (!isTransient(error) || transientErrors > maxTransientErrors) {
        throw error
      }
      lastError = error
    }
    if (!lastError && predicate(last)) return last
    await sleep(intervalMs)
  }
  if (lastError) throw lastError
  throw new Error(
    `Timed out waiting for ${label}. Last value: ${JSON.stringify(last)}`,
  )
}

describe('EventBridge Custom Event Bus subscribers', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const configFilePath = path.join(configFileDirPath, 'serverless.yml')
  const cfnClient = new CloudFormationClient({ region: TEST_REGION })
  const logsClient = new CloudWatchLogsClient({ region: TEST_REGION })
  const eventBridgeClient = new EventBridgeV2Client({ region: TEST_REGION })
  const originalEnv = process.env
  const stage = getTestStageName()
  const startTime = Date.now() - 60000
  let service, stackName, busArn, dlqArn
  // Events published to pausedConsumer while its subscriber is stopped.
  const pausedRun = `${stage}-paused`
  const pausedCount = 3
  let deployed = false
  // The redeploy test's background publisher runs while this is true. It
  // lives here so afterAll can stop it when that test times out mid-deploy.
  let publishing = false
  let publisher

  const functionName = (key) => `${service.service}-${stage}-${key}`

  const deploy = (options = {}) =>
    runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, ...options },
        command: ['deploy'],
      },
      jest,
    })

  const stackResourcesOfType = async (type) => {
    const resources = []
    let NextToken
    do {
      const page = await cfnClient.send(
        new ListStackResourcesCommand({ StackName: stackName, NextToken }),
      )
      resources.push(...page.StackResourceSummaries)
      NextToken = page.NextToken
    } while (NextToken)
    return resources.filter((resource) => resource.ResourceType === type)
  }

  const subscribersOf = async (functionKey) => {
    const prefix = `${functionKey[0].toUpperCase()}${functionKey.slice(1)}EventBridgeSubscriber`
    return (await stackResourcesOfType('AWS::EventsV2::Subscriber')).filter(
      (resource) => resource.LogicalResourceId.startsWith(prefix),
    )
  }

  // Publishes one PutEvents request; `run` tags every event so each test
  // reads back only its own deliveries.
  const publish = async (entries) => {
    const response = await eventBridgeClient.send(
      new PutEventsCommand({
        EventBusArn: busArn,
        Entries: entries.map(({ detailType, run, seq, group }) => ({
          Source: SOURCE,
          DetailType: detailType,
          Detail: JSON.stringify({ run, seq }),
          ...(group ? { SystemMetadata: { EventGroupId: group } } : {}),
        })),
      }),
    )
    if (response.FailedEntryCount) {
      throw new Error(
        `PutEvents rejected ${response.FailedEntryCount} entries: ${JSON.stringify(response.Entries)}`,
      )
    }
  }

  // Every invocation of a consumer that carried an event of `run`, oldest
  // first: { timestamp, batch, seqs }.
  const readDeliveries = async (functionKey, run) => {
    const deliveries = []
    let nextToken
    do {
      const page = await logsClient.send(
        new FilterLogEventsCommand({
          logGroupName: `/aws/lambda/${functionName(functionKey)}`,
          filterPattern: `"${DELIVERY_MARKER}" "${run}"`,
          startTime,
          nextToken,
        }),
      )
      for (const { message, timestamp } of page.events ?? []) {
        const json = message.slice(
          message.indexOf(DELIVERY_MARKER) + DELIVERY_MARKER.length,
        )
        const { batch, events } = JSON.parse(json)
        deliveries.push({
          timestamp,
          batch,
          seqs: events.filter((e) => e.run === run).map((e) => e.seq),
        })
      }
      nextToken = page.nextToken
    } while (nextToken)
    return deliveries.sort((a, b) => a.timestamp - b.timestamp)
  }

  const deliveredSeqs = (deliveries) =>
    new Set(deliveries.flatMap((delivery) => delivery.seqs))

  const waitForAll = (functionKey, run, count, maxMs = 180000) =>
    pollUntil(
      () => readDeliveries(functionKey, run),
      (deliveries) => deliveredSeqs(deliveries).size >= count,
      { maxMs, label: `${count} ${run} events at ${functionKey}` },
    )

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    service = await readConfig(configFilePath)
    stackName = `${service.service}-${stage}`
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(async () => {
    publishing = false
    await publisher?.catch(() => {})
    // The `Remove` test below is the asserted teardown path; this is the
    // safety net for a run where a test failed before it could remove the
    // stack, which also holds the bus.
    try {
      if (deployed) {
        jest.restoreAllMocks()
        try {
          await runSfCore({
            coreParams: {
              options: { stage, c: configFilePath },
              command: ['remove'],
            },
            jest,
          })
        } catch (error) {
          console.error(
            `afterAll remove failed for ${configFilePath} (stage ${stage}):`,
            error,
          )
          throw error
        }
      }
    } finally {
      process.env = originalEnv
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy', async () => {
    deployed = true
    await deploy()

    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    const output = (key) =>
      Stacks[0].Outputs.find((o) => o.OutputKey === key)?.OutputValue
    busArn = output('OrdersBusArn')
    dlqArn = output('BatchConsumerDlqArn')
    expect(busArn).toMatch(/:event-busv2\//)
    expect(dlqArn).toMatch(/^arn:aws:sqs:/)
    expect(await subscribersOf('fifoConsumer')).toHaveLength(1)
    expect(await subscribersOf('batchConsumer')).toHaveLength(1)
    expect(await subscribersOf('pausedConsumer')).toHaveLength(1)
  })

  // A new subscriber starts at the latest event, so wait until each one
  // delivers before the assertions below count what was published.
  test('Both subscribers deliver', async () => {
    const run = `${stage}-ready`
    let seq = 0
    await pollUntil(
      async () => {
        await publish([
          { detailType: 'FifoProbe', run, seq, group: run },
          { detailType: 'BatchProbe', run, seq },
        ])
        seq += 1
        return Promise.all([
          readDeliveries('fifoConsumer', run),
          readDeliveries('batchConsumer', run),
        ])
      },
      (results) => results.every((deliveries) => deliveries.length > 0),
      { intervalMs: 10000, maxMs: 300000, label: 'the first deliveries' },
    )
  })

  // pausedConsumer deploys with `enabled: false`; the redeploy below resumes
  // it, and these events must then arrive.
  test('A stopped subscriber accepts events without delivering them', async () => {
    const [subscriber] = await subscribersOf('pausedConsumer')
    const { State } = await eventBridgeClient.send(
      new DescribeSubscriberCommand({
        SubscriberArn: subscriber.PhysicalResourceId,
      }),
    )
    expect(State).toBe('STOPPED')

    await publish(
      Array.from({ length: pausedCount }, (_, seq) => ({
        detailType: 'PausedProbe',
        run: pausedRun,
        seq,
      })),
    )
  })

  // All events go out in one PutEvents call (10 entries at most), and
  // fifoConsumer's handler holds each invocation for 200 ms
  // (DELIVERY_DELAY_MS; batchConsumer has no delay). An unordered subscriber
  // may invoke in parallel and would very likely reorder them; the FIFO
  // subscriber delivers one group in order.
  test('fifoConsumer receives one object per event, in publish order', async () => {
    const run = `${stage}-fifo`
    const count = 10
    const expected = Array.from({ length: count }, (_, seq) => seq)
    await publish(
      expected.map((seq) => ({
        detailType: 'FifoProbe',
        run,
        seq,
        group: run,
      })),
    )

    const deliveries = await waitForAll('fifoConsumer', run, count)

    for (const delivery of deliveries) {
      expect(delivery.batch).toBe(false)
      expect(delivery.seqs).toHaveLength(1)
    }
    // At-least-once delivery can repeat an event; the first time each one
    // arrives is what carries the order.
    const firstArrivals = [
      ...new Set(deliveries.map((delivery) => delivery.seqs[0])),
    ]
    expect(firstArrivals).toEqual(expected)
  })

  test('batchConsumer receives arrays', async () => {
    const run = `${stage}-batch`
    const count = 5
    await publish(
      Array.from({ length: count }, (_, seq) => ({
        detailType: 'BatchProbe',
        run,
        seq,
      })),
    )

    const deliveries = await waitForAll('batchConsumer', run, count)

    for (const delivery of deliveries) {
      expect(delivery.batch).toBe(true)
    }
    expect([...deliveredSeqs(deliveries)].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ])
  })

  test('agent inspect describes the subscribers and the bus', async () => {
    const stdout = []
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        stdout.push(String(chunk))
        return true
      })
    try {
      await runSfCore({
        coreParams: {
          options: {
            stage,
            c: configFilePath,
            'aws-services': 'eventbridgev2',
          },
          command: ['agent', 'inspect'],
        },
        jest,
      })
    } finally {
      spy.mockRestore()
    }
    const output = stdout.join('')
    const { resources } = JSON.parse(output.slice(output.indexOf('{')))

    const busData = resources.events.OrdersBus
    expect(busData.error).toBeUndefined()
    expect(busData.eventBus.EventBusArn).toBe(busArn)

    const [fifoSubscriber] = await subscribersOf('fifoConsumer')
    const [batchSubscriber] = await subscribersOf('batchConsumer')
    expect(
      await stackResourcesOfType('AWS::EventsV2::Subscriber'),
    ).toHaveLength(3)
    const inspected = ({ LogicalResourceId, PhysicalResourceId }) => {
      const data = resources.events[LogicalResourceId]
      expect(data.error).toBeUndefined()
      expect(data.subscriber.SubscriberArn).toBe(PhysicalResourceId)
      expect(data.subscriber.EventBusArn).toBe(busArn)
      return data.subscriber
    }

    const fifo = inspected(fifoSubscriber)
    expect(fifo.Type).toBe('FIFO')

    const batch = inspected(batchSubscriber)
    expect(batch.Type).toBe('UNORDERED')
    expect(batch.OnFailureConfiguration).toEqual({ Arn: dlqArn })
  })

  // The tests in between gave a running subscriber ample time to deliver.
  test('The stopped subscriber delivered nothing', async () => {
    expect(await readDeliveries('pausedConsumer', pausedRun)).toEqual([])
  })

  // Changing `ordering` replaces the subscriber. With the generated name,
  // CloudFormation creates the new subscriber before it deletes the old one,
  // so an event published at any point of the redeploy reaches the function.
  test('Redeploying with a new ordering delivers every event published meanwhile', async () => {
    const run = `${stage}-swap`
    const [oldSubscriber] = await subscribersOf('batchConsumer')

    let seq = 0
    publishing = true
    const publishErrors = []
    publisher = (async () => {
      while (publishing) {
        try {
          // Every event carries a group, which the FIFO subscriber orders by.
          await publish([{ detailType: 'BatchProbe', run, seq, group: run }])
          seq += 1
        } catch (error) {
          publishErrors.push(error.message)
        }
        await sleep(1000)
      }
    })()

    try {
      // pausedEnabled resumes pausedConsumer's subscriber, for the next test.
      await deploy({ param: ['batchOrdering=fifo', 'pausedEnabled=true'] })
      // Keep publishing past the deploy, while the new subscriber takes over.
      await sleep(10000)
    } finally {
      publishing = false
      await publisher
    }
    expect(publishErrors).toEqual([])

    const subscribers = await subscribersOf('batchConsumer')
    expect(subscribers).toHaveLength(1)
    expect(subscribers[0].LogicalResourceId).not.toBe(
      oldSubscriber.LogicalResourceId,
    )
    const { Type } = await eventBridgeClient.send(
      new DescribeSubscriberCommand({
        SubscriberArn: subscribers[0].PhysicalResourceId,
      }),
    )
    expect(Type).toBe('FIFO')

    const deliveries = await waitForAll('batchConsumer', run, seq, 300000)
    expect([...deliveredSeqs(deliveries)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: seq }, (_, i) => i),
    )
  })

  // The redeploy above sets State RUNNING with the default resumePosition
  // (last_processed), so the events published while stopped arrive.
  test('Re-enabling a stopped subscriber delivers the events it held', async () => {
    const [subscriber] = await subscribersOf('pausedConsumer')
    const { State } = await eventBridgeClient.send(
      new DescribeSubscriberCommand({
        SubscriberArn: subscriber.PhysicalResourceId,
      }),
    )
    expect(State).toBe('RUNNING')

    const deliveries = await waitForAll(
      'pausedConsumer',
      pausedRun,
      pausedCount,
    )
    expect([...deliveredSeqs(deliveries)].sort((a, b) => a - b)).toEqual([
      0, 1, 2,
    ])
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })
    deployed = false

    await expect(
      cfnClient.send(new DescribeStacksCommand({ StackName: stackName })),
    ).rejects.toThrow(/does not exist/)
  })
})
