import dns from 'dns'
import https from 'https'
import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  ACMClient,
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from '@aws-sdk/client-acm'
import {
  APIGatewayClient,
  CreateDomainNameCommand,
  DeleteDomainNameCommand,
} from '@aws-sdk/client-api-gateway'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import {
  CloudFrontClient,
  ListDistributionsCommand,
} from '@aws-sdk/client-cloudfront'
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  ChangeResourceRecordSetsCommand,
  GetHostedZoneCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
  Route53Client,
} from '@aws-sdk/client-route-53'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'domains-web-apps'
// The test zone: a public Route 53 hosted zone in the test account, from the
// environment. The fixture reads the same variable. REGION is the Region of
// the stack and of the certificates CloudFront reads.
const ZONE = process.env.SLS_DOMAINS_TEST_ZONE
if (!ZONE) {
  throw new Error(
    'Set SLS_DOMAINS_TEST_ZONE to the public Route 53 hosted zone the domain tests use.',
  )
}
const REGION = 'us-east-1'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET https://<hostname><requestPath> and parse the JSON body of a 200
 * answer. The hostname is resolved through the given resolver, which asks the
 * zone's own name servers: a recursive resolver that looked the new name up
 * before its records reached every name server keeps answering "not found"
 * for the zone's negative-caching TTL.
 */
const getJson = (resolver, hostname, requestPath) =>
  new Promise((resolve, reject) => {
    const lookup = (name, options, callback) => {
      resolver.resolve4(name).then(
        (addresses) =>
          options.all
            ? callback(
                null,
                addresses.map((address) => ({ address, family: 4 })),
              )
            : callback(null, addresses[0], 4),
        callback,
      )
    }
    https
      .get({ hostname, path: requestPath, lookup, timeout: 10000 }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${res.statusCode} from ${hostname}${requestPath}`,
              ),
            )
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(
              new Error(`Not JSON from ${hostname}${requestPath}: ${body}`),
            )
          }
        })
      })
      .on('timeout', function () {
        this.destroy(new Error(`${hostname}${requestPath} timed out`))
      })
      .on('error', reject)
  })

/**
 * Retry fn until it resolves, for up to maxMs: a new hostname needs its alias
 * records and the distribution needs to finish deploying.
 */
const whenReady = async (fn, { maxMs = 600000 } = {}) => {
  const deadline = Date.now() + maxMs
  let last
  while (Date.now() < deadline) {
    try {
      return await fn()
    } catch (error) {
      last = error
    }
    await sleep(10000)
  }
  throw last
}

describe('Serverless Framework Service - Domains Web Apps', () => {
  const configFilePath = path.join(__dirname, 'fixture', 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`
  // The fixture names the hostname after the stage, so each run has its own.
  const hostname = `wa-${stage}.${ZONE}`
  const originalEnv = process.env

  const acmClient = new ACMClient({ region: REGION })
  const apiGatewayClient = new APIGatewayClient({ region: REGION })
  const cfnClient = new CloudFormationClient({ region: REGION })
  const cloudFrontClient = new CloudFrontClient({ region: REGION })
  const logsClient = new CloudWatchLogsClient({ region: REGION })
  const route53Client = new Route53Client({ region: REGION })

  let deployed = false
  let apiGatewayDomainCreated = false

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

  const hostedZoneId = async () => {
    const { HostedZones } = await route53Client.send(
      new ListHostedZonesByNameCommand({ DNSName: ZONE }),
    )
    const zone = HostedZones.find(
      (z) => z.Name === `${ZONE}.` && !z.Config?.PrivateZone,
    )
    return zone.Id.replace('/hostedzone/', '')
  }

  // A resolver that asks the test zone's own name servers.
  const zoneResolver = async () => {
    const { DelegationSet } = await route53Client.send(
      new GetHostedZoneCommand({ Id: await hostedZoneId() }),
    )
    const addresses = await Promise.all(
      DelegationSet.NameServers.map((name) => dns.promises.resolve4(name)),
    )
    const resolver = new dns.promises.Resolver()
    resolver.setServers(addresses.flat())
    return resolver
  }

  // The record sets with exactly this name (and type, when given).
  const recordSets = async (zoneId, name, type) => {
    const fqdn = `${name}.`
    const { ResourceRecordSets } = await route53Client.send(
      new ListResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        StartRecordName: fqdn,
        ...(type && { StartRecordType: type }),
      }),
    )
    return ResourceRecordSets.filter(
      (record) =>
        record.Name.toLowerCase() === fqdn.toLowerCase() &&
        (!type || record.Type === type),
    )
  }

  // The ARNs of this run's hostname's certificates in the given statuses.
  const certificateArns = async (
    statuses = ['ISSUED', 'PENDING_VALIDATION'],
  ) => {
    const arns = []
    let NextToken
    do {
      const page = await acmClient.send(
        new ListCertificatesCommand({
          CertificateStatuses: statuses,
          NextToken,
        }),
      )
      for (const certificate of page.CertificateSummaryList || []) {
        if (certificate.DomainName === hostname) {
          arns.push(certificate.CertificateArn)
        }
      }
      NextToken = page.NextToken
    } while (NextToken)
    return arns
  }

  /**
   * Delete the certificate the deploy created for this run's hostname and its
   * DNS validation record, which `remove` leaves by design. Only a
   * certificate for exactly this hostname and in use by nothing is deleted.
   */
  const deleteCertificates = async () => {
    const zoneId = await hostedZoneId()
    // A deploy that stopped mid-validation can leave a failed or timed-out one.
    for (const arn of await certificateArns([
      'ISSUED',
      'PENDING_VALIDATION',
      'FAILED',
      'VALIDATION_TIMED_OUT',
    ])) {
      const { Certificate } = await acmClient.send(
        new DescribeCertificateCommand({ CertificateArn: arn }),
      )
      if (Certificate.DomainName !== hostname) continue
      // The distribution can take a while to release it after the stack is gone.
      let inUseBy = Certificate.InUseBy || []
      for (let attempt = 1; inUseBy.length > 0 && attempt <= 20; attempt++) {
        await sleep(15000)
        const described = await acmClient.send(
          new DescribeCertificateCommand({ CertificateArn: arn }),
        )
        inUseBy = described.Certificate.InUseBy || []
      }
      if (inUseBy.length > 0) {
        throw new Error(`${arn} is still in use by ${inUseBy.join(', ')}`)
      }
      await acmClient.send(
        new DeleteCertificateCommand({ CertificateArn: arn }),
      )

      for (const option of Certificate.DomainValidationOptions || []) {
        const record = option.ResourceRecord
        if (!record || option.DomainName !== hostname) continue
        const name = record.Name.replace(/\.$/, '')
        for (const recordSet of await recordSets(zoneId, name, record.Type)) {
          await route53Client.send(
            new ChangeResourceRecordSetsCommand({
              HostedZoneId: zoneId,
              ChangeBatch: {
                Changes: [{ Action: 'DELETE', ResourceRecordSet: recordSet }],
              },
            }),
          )
        }
      }
    }
  }

  beforeAll(() => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    // Teardown of everything this run created, in dependency order: the
    // stack (if a failed step left it), the API Gateway domain, then the
    // certificate both used and its validation record.
    jest.restoreAllMocks()
    const failures = []
    try {
      if (deployed && (await stackExists())) {
        await run(['remove'], { expectError: true })
      }
    } catch (error) {
      failures.push(`remove ${stackName}: ${error.message}`)
    }
    if (apiGatewayDomainCreated) {
      try {
        await apiGatewayClient.send(
          new DeleteDomainNameCommand({ domainName: hostname }),
        )
      } catch (error) {
        if (error.name !== 'NotFoundException') {
          failures.push(
            `delete API Gateway domain ${hostname}: ${error.message}`,
          )
        }
      }
    }
    if (deployed) {
      try {
        await deleteCertificates()
      } catch (error) {
        failures.push(`delete certificate for ${hostname}: ${error.message}`)
      }
    }
    process.env = originalEnv
    if (failures.length > 0) {
      throw new Error(`Teardown left resources behind:\n${failures.join('\n')}`)
    }
  }, 900000)

  test('Deploy', async () => {
    deployed = true
    await run(['deploy'])
  }, 1200000)

  test('Each path reaches its web app on the hostname', async () => {
    const resolver = await zoneResolver()
    const get = (requestPath) =>
      whenReady(() => getJson(resolver, hostname, requestPath))

    expect(await get('/')).toEqual({
      app: 'web',
      path: '/',
      forwardedHost: hostname,
    })
    // basePath forwards the path unchanged, for the bare prefix too.
    for (const requestPath of ['/api', '/api/users?id=1']) {
      expect(await get(requestPath)).toEqual({
        app: 'api',
        path: requestPath,
        forwardedHost: hostname,
      })
    }
    expect((await get('/apiary')).app).toBe('web')
  }, 900000)

  test('A direct request to a web app endpoint gets 403', async () => {
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    const outputs = Object.fromEntries(
      Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]),
    )
    for (const outputKey of ['WebWebFunctionUrl', 'ApiWebFunctionUrl']) {
      expect(outputs[outputKey]).toMatch(/^https:\/\//)
      const response = await fetch(outputs[outputKey])
      expect(response.status).toBe(403)
    }
  })

  test('Remove leaves no stack, distribution, alias records or log groups', async () => {
    await run(['remove'])

    expect(await stackExists()).toBe(false)

    const aliases = []
    let Marker
    do {
      const { DistributionList } = await cloudFrontClient.send(
        new ListDistributionsCommand({ Marker }),
      )
      for (const distribution of DistributionList.Items || []) {
        aliases.push(...(distribution.Aliases?.Items || []))
      }
      Marker = DistributionList.IsTruncated
        ? DistributionList.NextMarker
        : undefined
    } while (Marker)
    expect(aliases).not.toContain(hostname)

    const zoneId = await hostedZoneId()
    expect(await recordSets(zoneId, hostname)).toEqual([])

    const { logGroups } = await logsClient.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: `/aws/lambda/web/${SERVICE}-${stage}-`,
      }),
    )
    expect(logGroups.map((group) => group.logGroupName)).toEqual([])
  }, 1200000)

  test('Deploy stops when the hostname is an API Gateway custom domain', async () => {
    // The certificate the first deploy created for the hostname, which
    // `remove` keeps, lets API Gateway take the same name.
    const [certificateArn] = await certificateArns()
    expect(certificateArn).toBeDefined()
    await apiGatewayClient.send(
      new CreateDomainNameCommand({
        domainName: hostname,
        regionalCertificateArn: certificateArn,
        endpointConfiguration: { types: ['REGIONAL'] },
        securityPolicy: 'TLS_1_2',
      }),
    )
    apiGatewayDomainCreated = true

    await expect(run(['deploy'], { expectError: true })).rejects.toThrow(
      `${hostname} is already an API Gateway custom domain in this account.`,
    )
    // Stopped before any change.
    expect(await stackExists()).toBe(false)
  })
})
