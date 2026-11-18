import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
} from '@aws-sdk/client-cloudformation'
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
} from '@aws-sdk/client-ec2'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { TEST_REGION } from '../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'sfc-web-apps-vpc'

// Availability Zones where Lambda cannot place network interfaces.
const UNSUPPORTED_ZONE_IDS = new Set(['use1-az3'])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Requests `target` every `intervalMs` until `isDone(body)` holds for a JSON
 * body, for up to `timeoutMs`; each request is given `requestTimeoutMs`. On
 * timeout it fails with every attempt's status and body, so a real failure
 * still shows what the endpoint answered.
 */
const pollJson = async (
  target,
  isDone,
  { intervalMs = 3000, timeoutMs = 90_000, requestTimeoutMs = 15_000 } = {},
) => {
  const attempts = []
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let recorded = false
    try {
      const response = await fetch(target, {
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
      const text = await response.text()
      attempts.push(`${response.status} ${text}`)
      recorded = true
      if (response.ok) {
        const body = JSON.parse(text)
        if (isDone(body)) return body
      }
    } catch (error) {
      // A body that is not JSON is already in the status line
      if (!recorded) attempts.push(`error ${error.message}`)
    }
    if (Date.now() + intervalMs > deadline) {
      throw new Error(
        `${target} did not answer as expected within ${timeoutMs / 1000} s. Attempts:\n${attempts.join('\n')}`,
      )
    }
    await sleep(intervalMs)
  }
}

/**
 * Two subnets and the default security group of the Region's default VPC,
 * and the VPC's DNS resolver address (the VPC CIDR base plus two).
 */
const defaultVpcNetwork = async (ec2) => {
  const { Vpcs = [] } = await ec2.send(
    new DescribeVpcsCommand({
      Filters: [{ Name: 'is-default', Values: ['true'] }],
    }),
  )
  if (Vpcs.length === 0) {
    throw new Error(`No default VPC in ${TEST_REGION}`)
  }
  const { VpcId, CidrBlock } = Vpcs[0]
  const { Subnets = [] } = await ec2.send(
    new DescribeSubnetsCommand({
      Filters: [
        { Name: 'vpc-id', Values: [VpcId] },
        { Name: 'default-for-az', Values: ['true'] },
      ],
    }),
  )
  const subnets = Subnets.filter(
    (subnet) => !UNSUPPORTED_ZONE_IDS.has(subnet.AvailabilityZoneId),
  ).sort((a, b) => a.AvailabilityZoneId.localeCompare(b.AvailabilityZoneId))
  if (subnets.length < 2) {
    throw new Error(`The default VPC ${VpcId} has fewer than two subnets`)
  }
  const { SecurityGroups = [] } = await ec2.send(
    new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: 'vpc-id', Values: [VpcId] },
        { Name: 'group-name', Values: ['default'] },
      ],
    }),
  )
  const [a, b, c, d] = CidrBlock.split('/')[0].split('.').map(Number)
  return {
    subnetIds: [subnets[0].SubnetId, subnets[1].SubnetId],
    securityGroupId: SecurityGroups[0].GroupId,
    resolver: [a, b, c, d + 2].join('.'),
  }
}

describe('Serverless Framework Service - Web Apps in a VPC', () => {
  const configFilePath = path.join(__dirname, 'fixture-vpc', 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`
  const originalEnv = process.env

  const cfnClient = new CloudFormationClient({ region: TEST_REGION })
  const logsClient = new CloudWatchLogsClient({ region: TEST_REGION })
  const ec2Client = new EC2Client({ region: TEST_REGION })

  const run = (command, params = {}) =>
    runSfCore({
      coreParams: { options: { stage, c: configFilePath }, command },
      jest,
      ...params,
    })

  const stackExists = async () => {
    try {
      const { Stacks } = await cfnClient.send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      return Stacks?.[0]?.StackStatus !== 'DELETE_COMPLETE'
    } catch (error) {
      if (/does not exist/.test(error?.message ?? '')) return false
      throw error
    }
  }

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    const network = await defaultVpcNetwork(ec2Client)
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
      WEB_APPS_TEST_SUBNET_A: network.subnetIds[0],
      WEB_APPS_TEST_SUBNET_B: network.subnetIds[1],
      WEB_APPS_TEST_SECURITY_GROUP: network.securityGroupId,
      WEB_APPS_TEST_VPC_RESOLVER: network.resolver,
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    // Safety net: remove the stack when a failed step left it standing, and
    // fail the run when it cannot be removed, so a leak never passes as green.
    jest.restoreAllMocks()
    let failure
    try {
      if (await stackExists()) {
        await run(['remove'], { expectError: true })
        if (await stackExists()) throw new Error('the stack still exists')
      }
    } catch (error) {
      failure = new Error(`Teardown of ${stackName} failed: ${error.message}`)
    }
    process.env = originalEnv
    if (failure) throw failure
  }, 900000)

  test('Deploy: web apps inheriting provider.vpc share one network connector; one with its own vpc gets its own', async () => {
    await run(['deploy'])

    const { StackResources } = await cfnClient.send(
      new DescribeStackResourcesCommand({ StackName: stackName }),
    )
    const connectors = StackResources.filter(
      (resource) => resource.ResourceType === 'AWS::Lambda::NetworkConnector',
    )
    expect(
      connectors.map((resource) => resource.LogicalResourceId).sort(),
    ).toEqual(['OwnWebFunctionNetworkConnector', 'WebAppsNetworkConnector'])

    // The inheriting revisions egress through the shared connector, the other
    // through its own.
    const { TemplateBody } = await cfnClient.send(
      new GetTemplateCommand({ StackName: stackName }),
    )
    const { Resources } = JSON.parse(TemplateBody)
    const connectorOf = (revision) =>
      Resources[revision].Properties.ServiceConfig.EgressNetworkConnectorArn
    for (const [revision, connector] of [
      ['OneWebFunctionRevision', 'WebAppsNetworkConnector'],
      ['TwoWebFunctionRevision', 'WebAppsNetworkConnector'],
      ['OwnWebFunctionRevision', 'OwnWebFunctionNetworkConnector'],
    ]) {
      expect(connectorOf(revision)).toEqual({
        'Fn::GetAtt': [connector, 'LatestVersionArn'],
      })
    }
  })

  test('Every web app answers and reaches the VPC', async () => {
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    const outputs = Object.fromEntries(
      Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]),
    )
    // Right after the first deploy that creates a VPC connector, connections
    // into the VPC can time out for up to about a minute
    for (const [name, outputKey] of [
      ['one', 'OneWebFunctionUrl'],
      ['two', 'TwoWebFunctionUrl'],
      ['own', 'OwnWebFunctionUrl'],
    ]) {
      expect(
        await pollJson(
          `${outputs[outputKey]}/vpc`,
          (body) => body.app === name && body.vpcResolver === true,
        ),
      ).toEqual({ app: name, vpcResolver: true })
    }
  })

  test('Remove: no stack or log groups remain', async () => {
    await run(['remove'])

    expect(await stackExists()).toBe(false)
    const { logGroups } = await logsClient.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: `/aws/lambda/web/${SERVICE}-${stage}-`,
      }),
    )
    expect(logGroups.map((group) => group.logGroupName)).toEqual([])
  })
})
