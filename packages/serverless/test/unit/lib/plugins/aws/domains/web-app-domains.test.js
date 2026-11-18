import { afterEach, describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { APIGatewayClient } from '@aws-sdk/client-api-gateway'
import { ApiGatewayV2Client } from '@aws-sdk/client-apigatewayv2'
import {
  ChangeResourceRecordSetsCommand,
  ListHostedZonesCommand,
  Route53Client,
} from '@aws-sdk/client-route-53'
import ServerlessCustomDomain from '../../../../../../lib/plugins/aws/domains/index.js'
import ACMWrapper from '../../../../../../lib/plugins/aws/domains/aws/acm-wrapper.js'
import APIGatewayV1Wrapper from '../../../../../../lib/plugins/aws/domains/aws/api-gateway-v1-wrapper.js'
import APIGatewayV2Wrapper from '../../../../../../lib/plugins/aws/domains/aws/api-gateway-v2-wrapper.js'
import CloudFormationWrapper from '../../../../../../lib/plugins/aws/domains/aws/cloud-formation-wrapper.js'
import Route53Wrapper from '../../../../../../lib/plugins/aws/domains/aws/route53-wrapper.js'
import DomainConfig from '../../../../../../lib/plugins/aws/domains/models/domain-config.js'
import WebAppDomainConfig from '../../../../../../lib/plugins/aws/domains/models/web-app-domain-config.js'
import Globals from '../../../../../../lib/plugins/aws/domains/globals.js'

const CERT_ARN = 'arn:aws:acm:us-east-1:123456789012:certificate/abc'
const US_EAST_1_CONTEXT =
  'CloudFront uses certificates from us-east-1; request or import the certificate there.'
const HOSTED_ZONE_CONTEXT =
  'Set createRoute53Record: false on the domain entry to manage DNS yourself.'

const distribution = () => ({
  Type: 'AWS::CloudFront::Distribution',
  Properties: {
    DistributionConfig: {
      Aliases: ['shop.example.com'],
      ViewerCertificate: {
        SslSupportMethod: 'sni-only',
        MinimumProtocolVersion: 'TLSv1.2_2021',
      },
    },
  },
})

const createServerless = ({ domains, domain, resources } = {}) => ({
  service: {
    service: 'shop',
    provider: {
      stage: 'dev',
      domain,
      domains,
      compiledCloudFormationTemplate: {
        Resources: resources ?? {
          ShopDotexampleDotcomCloudFrontDistribution: distribution(),
        },
        Outputs: {},
      },
    },
  },
  providers: {
    aws: {
      getCredentials: async () => ({}),
      getRegion: () => 'eu-west-1',
    },
  },
  cli: { log: jest.fn() },
})

const log = { verbose: jest.fn(), warning: jest.fn(), error: jest.fn() }

// What the deploy shows on its main progress line before the certificate step
const DEPLOYING = 'Deploying "shop" to stage "dev" (eu-west-1)'

/**
 * @param {object} config
 * @param {boolean} [config.animated] - false: progress lines print each
 *   message as a log line and keep no message (no TTY, CI)
 */
const createPlugin = ({ animated = true, ...config } = {}) => {
  const serverless = createServerless(config)
  // Every progress line the plugin opens, by namespace
  const progressLines = new Map()
  const progress = {
    get: jest.fn((namespace) => {
      if (!progressLines.has(namespace)) {
        const line = {
          message: animated && namespace === 'main' ? DEPLOYING : null,
          notice: jest.fn((message) => {
            if (animated) line.message = message
          }),
          remove: jest.fn(),
        }
        progressLines.set(namespace, line)
      }
      return progressLines.get(namespace)
    }),
  }
  const plugin = new ServerlessCustomDomain(
    serverless,
    { stage: 'dev' },
    { log, progress },
  )
  return { plugin, serverless, progress, progressLines }
}

const CREATING_CERTIFICATE =
  'Creating certificate for shop.example.com in us-east-1 (takes a few minutes)'
const WAITING_FOR_CERTIFICATE =
  'Waiting for the certificate for shop.example.com to be issued'

const resourcesOf = (serverless) =>
  serverless.service.provider.compiledCloudFormationTemplate.Resources

const viewerCertificateOf = (serverless) =>
  resourcesOf(serverless).ShopDotexampleDotcomCloudFrontDistribution.Properties
    .DistributionConfig.ViewerCertificate

const stubNoApiGatewayDomains = () => {
  const v1 = jest
    .spyOn(APIGatewayV1Wrapper.prototype, 'getCustomDomain')
    .mockResolvedValue(undefined)
  const v2 = jest
    .spyOn(APIGatewayV2Wrapper.prototype, 'getCustomDomain')
    .mockResolvedValue(undefined)
  return { v1, v2 }
}

afterEach(() => {
  jest.restoreAllMocks()
  Globals.v3Utils = undefined
})

describe('WebAppDomainConfig', () => {
  it('reads the web-app fields with the domains defaults', () => {
    const domain = new WebAppDomainConfig({
      name: 'shop.example.com',
      webApp: 'shop',
      basePath: '/api/',
    })
    expect(domain).toMatchObject({
      name: 'shop.example.com',
      givenDomainName: 'shop.example.com',
      basePath: 'api',
      webApp: 'shop',
      createRoute53Record: true,
      createRoute53IPv6Record: true,
      splitHorizonDns: false,
      enabled: true,
      route53Params: { routingPolicy: 'simple', weight: 200 },
    })
    expect(domain.apiType).toBeUndefined()
    expect(domain.endpointType).toBeUndefined()
  })

  it('lower-cases the hostname', () => {
    expect(
      new WebAppDomainConfig({ name: 'Shop.Example.COM', webApp: 'a' }).name,
    ).toBe('shop.example.com')
  })

  it('picks one entry per hostname across case, preferring the root entry', () => {
    const api = new WebAppDomainConfig({
      name: 'SHOP.example.com',
      webApp: 'api',
      basePath: 'api',
    })
    const root = new WebAppDomainConfig({
      name: 'shop.example.com',
      webApp: 'shop',
    })
    expect(WebAppDomainConfig.perHostname([api, root])).toEqual([root])
  })

  it('has no basePath for an entry without one', () => {
    expect(
      new WebAppDomainConfig({ domainName: 'shop.example.com', webApp: 'a' })
        .basePath,
    ).toBeUndefined()
  })

  it.each([
    'apiType',
    'endpointType',
    'securityPolicy',
    'accessMode',
    'allowPathMatching',
    'preserveExternalPathMappings',
    'autoDomain',
    'autoDomainWaitFor',
    'tlsTruststoreUri',
    'tlsTruststoreVersion',
    'rest',
    'http',
    'websocket',
  ])('rejects the API Gateway-only field %s', (key) => {
    expect(
      () =>
        new WebAppDomainConfig(
          { name: 'shop.example.com', webApp: 'shop', [key]: 'x' },
          'provider.domains[2]',
        ),
    ).toThrow(
      `provider.domains[2].${key} applies to API Gateway domains only. Remove it from entries with webApp.`,
    )
  })

  it('throws the API Gateway-only field error without a stack trace', () => {
    let error
    try {
      new WebAppDomainConfig(
        { name: 'shop.example.com', webApp: 'shop', apiType: 'http' },
        'provider.domains[0]',
      )
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      code: 'WEB_APPS_DOMAIN_API_GATEWAY_FIELD',
      stack: undefined,
    })
  })

  it('throws a missing hostname without a stack trace', () => {
    let error
    try {
      WebAppDomainConfig.withHostnames([
        new WebAppDomainConfig({ webApp: 'shop' }, 'provider.domains[0]'),
      ])
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      code: 'WEB_APPS_VALIDATION_ERROR',
      stack: undefined,
    })
  })
})

describe('ServerlessCustomDomain with webApp entries', () => {
  describe('initializeVariables', () => {
    it('partitions webApp entries from API Gateway entries', () => {
      const { plugin } = createPlugin({
        resources: { HttpApi: { Type: 'AWS::ApiGatewayV2::Api' } },
        domain: { name: 'shop.example.com', webApp: 'shop' },
        domains: [
          'api.example.com',
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
          { name: 'ws.example.com', apiType: 'websocket' },
          { name: 'off.example.com', webApp: 'shop', enabled: false },
        ],
      })

      plugin.initializeVariables()

      expect(plugin.domains).toHaveLength(2)
      expect(plugin.domains.every((d) => d instanceof DomainConfig)).toBe(true)
      expect(plugin.domains.map((d) => [d.givenDomainName, d.apiType])).toEqual(
        [
          ['api.example.com', 'HTTP'],
          ['ws.example.com', 'WEBSOCKET'],
        ],
      )
      expect(
        plugin.webAppDomains.map((d) => [d.name, d.webApp, d.basePath]),
      ).toEqual([
        ['shop.example.com', 'shop', undefined],
        ['shop.example.com', 'api', 'api'],
      ])
      expect(
        plugin.webAppDomains.every((d) => d instanceof WebAppDomainConfig),
      ).toBe(true)
    })

    it('does not detect an API type when every entry targets a web app', () => {
      const { plugin } = createPlugin({
        resources: {
          HttpApi: { Type: 'AWS::ApiGatewayV2::Api' },
          ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' },
        },
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      const detect = jest.spyOn(plugin, 'getDefaultApiType')

      plugin.initializeVariables()

      expect(detect).not.toHaveBeenCalled()
      expect(plugin.domains).toEqual([])
      expect(plugin.webAppDomains).toHaveLength(1)
    })

    it('names the entry in an API Gateway-only field error', () => {
      const { plugin } = createPlugin({
        domain: 'api.example.com',
        domains: [
          { name: 'shop.example.com', webApp: 'shop', apiType: 'http' },
        ],
      })
      expect(() => plugin.initializeVariables()).toThrow(
        'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp.',
      )
    })
  })

  describe('certificate at before:aws:deploy:deploy:checkForChanges', () => {
    const hook = 'before:aws:deploy:deploy:checkForChanges'

    it('writes an issued certificate it finds into the distribution', async () => {
      const { plugin, serverless } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      const getCertificate = jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockResolvedValue({ arn: CERT_ARN, status: 'ISSUED' })
      const wait = jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockResolvedValue()

      await plugin.hooks[hook]()

      expect(getCertificate).toHaveBeenCalledTimes(1)
      expect(getCertificate.mock.calls[0][0].givenDomainName).toBe(
        'shop.example.com',
      )
      expect(wait).not.toHaveBeenCalled()
      expect(viewerCertificateOf(serverless)).toEqual({
        SslSupportMethod: 'sni-only',
        MinimumProtocolVersion: 'TLSv1.2_2021',
        AcmCertificateArn: CERT_ARN,
      })
    })

    it('shows no progress line for an issued certificate', async () => {
      const { plugin, progress } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockResolvedValue({ arn: CERT_ARN, status: 'ISSUED' })

      await plugin.hooks[hook]()

      expect(progress.get).not.toHaveBeenCalled()
    })

    it('looks the certificate up in us-east-1', async () => {
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      let region
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockImplementation(async function () {
          region = await this.acm.config.region()
          return { arn: CERT_ARN, status: 'ISSUED' }
        })

      await plugin.hooks[hook]()

      expect(region).toBe('us-east-1')
    })

    it('waits for a certificate it finds pending validation', async () => {
      const { plugin, serverless, progressLines } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockResolvedValue({ arn: CERT_ARN, status: 'PENDING_VALIDATION' })
      let noticedBeforeWait
      const wait = jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockImplementation(async () => {
          noticedBeforeWait = [...progressLines.values()].flatMap((line) =>
            line.notice.mock.calls.map(([message]) => message),
          )
        })

      await plugin.hooks[hook]()

      expect(wait).toHaveBeenCalledWith(CERT_ARN)
      expect(viewerCertificateOf(serverless).AcmCertificateArn).toBe(CERT_ARN)
      expect(noticedBeforeWait).toEqual([WAITING_FOR_CERTIFICATE])
      // The deploy's main progress line shows the step; the deploy owns it,
      // so it gets its message back rather than being removed
      expect([...progressLines.keys()]).toEqual(['main'])
      const line = progressLines.get('main')
      expect(line.notice.mock.calls).toEqual([
        [WAITING_FOR_CERTIFICATE],
        [DEPLOYING],
      ])
      expect(line.message).toBe(DEPLOYING)
      expect(line.remove).not.toHaveBeenCalled()
    })

    it('prints the step once and puts nothing back without an animated progress line', async () => {
      const { plugin, progressLines } = createPlugin({
        animated: false,
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockResolvedValue({ arn: CERT_ARN, status: 'PENDING_VALIDATION' })
      jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockResolvedValue()

      await plugin.hooks[hook]()

      const line = progressLines.get('main')
      expect(line.notice.mock.calls).toEqual([[WAITING_FOR_CERTIFICATE]])
      expect(line.remove).not.toHaveBeenCalled()
    })

    it('puts the main progress line back once the last hostname has its certificate', async () => {
      const { plugin, progressLines } = createPlugin({
        resources: {
          ShopDotexampleDotcomCloudFrontDistribution: distribution(),
          AdminDotexampleDotcomCloudFrontDistribution: distribution(),
        },
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'admin.example.com', webApp: 'shop' },
        ],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockImplementation(async (domain) => ({
          arn: `${CERT_ARN}-${domain.givenDomainName}`,
          status: 'PENDING_VALIDATION',
        }))
      // shop.example.com is issued first, admin.example.com after it
      const issued = {}
      const issue = {}
      for (const hostname of ['shop.example.com', 'admin.example.com']) {
        issued[hostname] = new Promise((resolve) => {
          issue[hostname] = resolve
        })
      }
      jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockImplementation((arn) => issued[arn.split('-').pop()])
      const line = () => progressLines.get('main')
      const waitingFor = (hostname) =>
        `Waiting for the certificate for ${hostname} to be issued`

      const step = plugin.hooks[hook]()
      await new Promise(setImmediate)
      expect(line().message).toBe(waitingFor('admin.example.com'))

      issue['shop.example.com']()
      await new Promise(setImmediate)
      // admin.example.com is still waiting
      expect(line().message).toBe(waitingFor('admin.example.com'))

      issue['admin.example.com']()
      await step
      expect(line().message).toBe(DEPLOYING)
      expect(line().remove).not.toHaveBeenCalled()
    })

    it('shows the hostname still waiting when another one has its certificate', async () => {
      const { plugin, progressLines } = createPlugin({
        resources: {
          ShopDotexampleDotcomCloudFrontDistribution: distribution(),
          AdminDotexampleDotcomCloudFrontDistribution: distribution(),
        },
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'admin.example.com', webApp: 'shop' },
        ],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockImplementation(async (domain) => ({
          arn: `${CERT_ARN}-${domain.givenDomainName}`,
          status: 'PENDING_VALIDATION',
        }))
      const issued = {}
      const issue = {}
      for (const hostname of ['shop.example.com', 'admin.example.com']) {
        issued[hostname] = new Promise((resolve) => {
          issue[hostname] = resolve
        })
      }
      jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockImplementation((arn) => issued[arn.split('-').pop()])
      const line = () => progressLines.get('main')

      const step = plugin.hooks[hook]()
      await new Promise(setImmediate)
      // admin.example.com noticed last, and is issued first
      issue['admin.example.com']()
      await new Promise(setImmediate)
      expect(line().message).toBe(
        'Waiting for the certificate for shop.example.com to be issued',
      )

      issue['shop.example.com']()
      await step
      expect(line().message).toBe(DEPLOYING)
    })

    it('creates and validates a certificate in the hosted zone', async () => {
      const { plugin, serverless, progressLines } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockRejectedValue(
          new Error("Could not find an in-date certificate for 'x'."),
        )
      jest
        .spyOn(Route53Wrapper.prototype, 'isDomainManagedByRoute53')
        .mockResolvedValue(true)
      const create = jest
        .spyOn(ACMWrapper.prototype, 'createCertificate')
        .mockResolvedValue(CERT_ARN)
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificateValidationRecords')
        .mockResolvedValue([{ Name: 'n', Type: 'CNAME', Value: 'v' }])
      const records = jest
        .spyOn(Route53Wrapper.prototype, 'createCertificateValidationRecords')
        .mockResolvedValue()
      const wait = jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockResolvedValue()

      await plugin.hooks[hook]()

      expect(create).toHaveBeenCalledWith('shop.example.com')
      expect(records).toHaveBeenCalledWith(
        [{ Name: 'n', Type: 'CNAME', Value: 'v' }],
        'shop.example.com',
      )
      expect(wait).toHaveBeenCalledWith(CERT_ARN)
      expect(viewerCertificateOf(serverless).AcmCertificateArn).toBe(CERT_ARN)
      expect([...progressLines.keys()]).toEqual(['main'])
      const line = progressLines.get('main')
      expect(line.notice.mock.calls).toEqual([
        [CREATING_CERTIFICATE],
        [DEPLOYING],
      ])
      expect(line.notice.mock.invocationCallOrder[0]).toBeLessThan(
        create.mock.invocationCallOrder[0],
      )
      expect(line.remove).not.toHaveBeenCalled()
    })

    it('puts the main progress line back when the certificate cannot be issued', async () => {
      const { plugin, progressLines } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockResolvedValue({ arn: CERT_ARN, status: 'PENDING_VALIDATION' })
      const failure = new Error('validation timed out')
      jest
        .spyOn(ACMWrapper.prototype, 'waitForCertificateValidation')
        .mockRejectedValue(failure)

      await expect(plugin.hooks[hook]()).rejects.toBe(failure)

      const line = progressLines.get('main')
      expect(line.notice.mock.calls).toEqual([
        [WAITING_FOR_CERTIFICATE],
        [DEPLOYING],
      ])
      expect(line.remove).not.toHaveBeenCalled()
    })

    it('adds the DNS context when the hostname has no hosted zone', async () => {
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockRejectedValue(
          Object.assign(
            new Error("Could not find an in-date certificate for 'x'."),
            { code: 'ACM_CERTIFICATE_NOT_FOUND' },
          ),
        )
      jest
        .spyOn(Route53Wrapper.prototype, 'isDomainManagedByRoute53')
        .mockResolvedValue(false)

      await expect(plugin.hooks[hook]()).rejects.toMatchObject({
        code: 'ACM_CERTIFICATE_NOT_FOUND',
        message: `Could not find an in-date certificate for 'x'. ${US_EAST_1_CONTEXT}\n${HOSTED_ZONE_CONTEXT}`,
      })
    })

    it('leaves the DNS line out for an entry that already sets createRoute53Record: false', async () => {
      const { plugin } = createPlugin({
        domains: [
          {
            name: 'shop.example.com',
            webApp: 'shop',
            createRoute53Record: false,
          },
        ],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockRejectedValue(
          Object.assign(
            new Error("Could not find an in-date certificate for 'x'."),
            { code: 'ACM_CERTIFICATE_NOT_FOUND' },
          ),
        )
      jest
        .spyOn(Route53Wrapper.prototype, 'isDomainManagedByRoute53')
        .mockResolvedValue(false)

      await expect(plugin.hooks[hook]()).rejects.toMatchObject({
        code: 'ACM_CERTIFICATE_NOT_FOUND',
        message: `Could not find an in-date certificate for 'x'. ${US_EAST_1_CONTEXT}`,
      })
    })

    it('adds the us-east-1 context when a named certificate is not found', async () => {
      const { plugin } = createPlugin({
        domains: [
          { name: 'shop.example.com', webApp: 'shop', certificateName: 'x' },
        ],
      })
      jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockRejectedValue(
          Object.assign(
            new Error("Could not find an in-date certificate for 'x'."),
            { code: 'ACM_CERTIFICATE_NOT_FOUND' },
          ),
        )

      await expect(plugin.hooks[hook]()).rejects.toMatchObject({
        code: 'ACM_CERTIFICATE_NOT_FOUND',
        message: `Could not find an in-date certificate for 'x'. ${US_EAST_1_CONTEXT}`,
      })
    })

    it('makes no ACM call for a hostname with a literal certificateArn', async () => {
      const { plugin, serverless } = createPlugin({
        domains: [
          {
            name: 'shop.example.com',
            webApp: 'shop',
            certificateArn: CERT_ARN,
          },
        ],
      })
      const getCertificate = jest.spyOn(ACMWrapper.prototype, 'getCertificate')

      await plugin.hooks[hook]()

      expect(getCertificate).not.toHaveBeenCalled()
      expect(viewerCertificateOf(serverless).AcmCertificateArn).toBeUndefined()
    })

    it('looks one certificate up per hostname', async () => {
      const { plugin } = createPlugin({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        ],
      })
      const getCertificate = jest
        .spyOn(ACMWrapper.prototype, 'getCertificate')
        .mockResolvedValue({ arn: CERT_ARN, status: 'ISSUED' })

      await plugin.hooks[hook]()

      expect(getCertificate).toHaveBeenCalledTimes(1)
    })

    it('does nothing for a hostname whose distribution is not compiled', async () => {
      const { plugin } = createPlugin({
        resources: {},
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      const getCertificate = jest.spyOn(ACMWrapper.prototype, 'getCertificate')

      await expect(plugin.hooks[hook]()).resolves.toBeUndefined()
      expect(getCertificate).not.toHaveBeenCalled()
    })

    it('patches the template deploy --package restored from disk', async () => {
      const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-domains-'))
      try {
        const stateFile = path.join(packageDir, 'serverless-state.json')
        fs.writeFileSync(
          stateFile,
          JSON.stringify({
            service: {
              provider: {
                stage: 'dev',
                domains: [{ name: 'shop.example.com', webApp: 'shop' }],
                compiledCloudFormationTemplate: {
                  Resources: {
                    ShopDotexampleDotcomCloudFrontDistribution: distribution(),
                  },
                },
              },
            },
          }),
        )
        const { plugin, serverless } = createPlugin({ resources: {} })
        // What extendedValidate does during before:deploy:deploy.
        Object.assign(
          serverless.service,
          JSON.parse(fs.readFileSync(stateFile, 'utf8')).service,
        )
        jest
          .spyOn(ACMWrapper.prototype, 'getCertificate')
          .mockResolvedValue({ arn: CERT_ARN, status: 'ISSUED' })

        await plugin.hooks[hook]()

        expect(viewerCertificateOf(serverless).AcmCertificateArn).toBe(CERT_ARN)
      } finally {
        fs.rmSync(packageDir, { recursive: true, force: true })
      }
    })

    it('makes no call for API Gateway entries', async () => {
      const { plugin } = createPlugin({
        domains: [{ name: 'api.example.com', apiType: 'http' }],
      })
      const getCertificate = jest.spyOn(ACMWrapper.prototype, 'getCertificate')
      const getCertArn = jest.spyOn(ACMWrapper.prototype, 'getCertArn')

      await plugin.hooks[hook]()

      expect(getCertificate).not.toHaveBeenCalled()
      expect(getCertArn).not.toHaveBeenCalled()
    })
  })

  describe('API Gateway hostname guard at before:deploy:deploy', () => {
    const hook = 'before:deploy:deploy'

    it('passes when neither API Gateway API knows the hostname', async () => {
      const { plugin } = createPlugin({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        ],
      })
      const { v1, v2 } = stubNoApiGatewayDomains()

      await plugin.hooks[hook]()

      expect(v1).toHaveBeenCalledTimes(1)
      expect(v2).toHaveBeenCalledTimes(1)
      expect(v1.mock.calls[0][0].givenDomainName).toBe('shop.example.com')
    })

    it.each(['v1', 'v2'])(
      'stops the deploy when the %s API returns the hostname',
      async (version) => {
        const { plugin } = createPlugin({
          domains: [{ name: 'shop.example.com', webApp: 'shop' }],
        })
        const stubs = stubNoApiGatewayDomains()
        stubs[version].mockResolvedValue({ domainName: 'd.example.net' })

        await expect(plugin.hooks[hook]()).rejects.toMatchObject({
          message:
            'shop.example.com is already an API Gateway custom domain in this account, and a hostname serves either API Gateway APIs or web apps. Use another hostname for the web app, or delete the API Gateway custom domain first.',
          code: 'WEB_APPS_DOMAIN_IS_API_GATEWAY_DOMAIN',
          stack: undefined,
        })
      },
    )

    it('does not log a hostname API Gateway does not know', async () => {
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      const notFound = Object.assign(new Error('Not found'), {
        $metadata: { httpStatusCode: 404 },
      })
      const v1 = jest
        .spyOn(APIGatewayClient.prototype, 'send')
        .mockRejectedValue(notFound)
      const v2 = jest
        .spyOn(ApiGatewayV2Client.prototype, 'send')
        .mockRejectedValue(notFound)
      log.warning.mockClear()
      log.verbose.mockClear()

      await plugin.hooks[hook]()

      expect(v1).toHaveBeenCalledTimes(1)
      expect(v2).toHaveBeenCalledTimes(1)
      expect(log.warning).not.toHaveBeenCalled()
      expect(log.verbose).not.toHaveBeenCalled()
    })

    it('runs the guard before an API Gateway domain is created', async () => {
      const { plugin } = createPlugin({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'api.example.com', apiType: 'http' },
        ],
      })
      const stubs = stubNoApiGatewayDomains()
      stubs.v2.mockResolvedValue({ domainName: 'd.example.net' })
      const create = jest.spyOn(plugin, 'createOrGetDomainForCfOutputs')

      await expect(plugin.hooks[hook]()).rejects.toThrow(
        'is already an API Gateway custom domain',
      )
      expect(create).not.toHaveBeenCalled()
    })
  })

  describe('Route 53 aliases', () => {
    const outputs = {
      ShopDotexampleDotcomCloudFrontDistributionDomainName:
        'd111111abcdef8.cloudfront.net',
    }

    it('upserts A and AAAA aliases to the distribution after deploy', async () => {
      const { plugin } = createPlugin({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'shop.example.com', webApp: 'api', basePath: 'api' },
        ],
      })
      jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue(outputs)
      const send = jest
        .spyOn(Route53Client.prototype, 'send')
        .mockImplementation(async (command) => {
          if (command instanceof ListHostedZonesCommand) {
            return {
              HostedZones: [
                {
                  Id: '/hostedzone/ZONE1',
                  Name: 'example.com.',
                  Config: { PrivateZone: false },
                },
              ],
            }
          }
          return {}
        })

      await plugin.hooks['after:deploy:deploy']()

      const changes = send.mock.calls
        .map(([command]) => command)
        .filter((command) => command instanceof ChangeResourceRecordSetsCommand)
      expect(changes).toHaveLength(1)
      expect(changes[0].input.HostedZoneId).toBe('ZONE1')
      expect(changes[0].input.ChangeBatch.Changes).toEqual(
        ['A', 'AAAA'].map((Type) => ({
          Action: 'UPSERT',
          ResourceRecordSet: {
            AliasTarget: {
              DNSName: 'd111111abcdef8.cloudfront.net',
              EvaluateTargetHealth: false,
              HostedZoneId: 'Z2FDTNDATAQYW2',
            },
            Name: 'shop.example.com',
            Type,
          },
        })),
      )
    })

    it('deletes the aliases before remove, reading the stack outputs', async () => {
      const { plugin } = createPlugin({
        domains: [
          {
            name: 'shop.example.com',
            webApp: 'shop',
            createRoute53IPv6Record: false,
          },
        ],
      })
      const getOutputs = jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue(outputs)
      const change = jest
        .spyOn(Route53Wrapper.prototype, 'changeResourceRecordSet')
        .mockResolvedValue()

      await plugin.hooks['before:remove:remove']()

      expect(getOutputs).toHaveBeenCalledTimes(1)
      expect(change).toHaveBeenCalledTimes(1)
      const [action, domain] = change.mock.calls[0]
      expect(action).toBe('DELETE')
      expect(domain.givenDomainName).toBe('shop.example.com')
      expect(domain.domainInfo).toEqual({
        domainName: 'd111111abcdef8.cloudfront.net',
        hostedZoneId: 'Z2FDTNDATAQYW2',
      })
    })

    // The records are not stack resources: remove deletes them for each
    // hostname it can read, and leaves those of a skipped entry in place
    it('deletes the aliases of valid entries and names a skipped one before remove', async () => {
      Globals.v3Utils = { log }
      const { plugin } = createPlugin({
        domains: [
          { name: 'shop.example.com', webApp: 'shop' },
          { name: 'blog.example.com', webApp: 'shop', apiType: 'http' },
        ],
      })
      jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue({
          ...outputs,
          BlogDotexampleDotcomCloudFrontDistributionDomainName:
            'd222222abcdef8.cloudfront.net',
        })
      const change = jest
        .spyOn(Route53Wrapper.prototype, 'changeResourceRecordSet')
        .mockResolvedValue()
      log.warning.mockClear()

      await plugin.hooks['before:remove:remove']()

      expect(
        change.mock.calls.map(([action, domain]) => [
          action,
          domain.givenDomainName,
        ]),
      ).toEqual([['DELETE', 'shop.example.com']])
      expect(log.warning).toHaveBeenCalledWith(
        'provider.domains[1].apiType applies to API Gateway domains only. Remove it from entries with webApp. Skipping it. Its Route 53 records for blog.example.com, if the last deploy created any, may not be removed.',
      )
    })

    it('warns instead of failing remove when the records cannot be deleted', async () => {
      Globals.v3Utils = { log }
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue(outputs)
      jest
        .spyOn(Route53Wrapper.prototype, 'changeResourceRecordSet')
        .mockRejectedValue(new Error('record not found'))
      log.warning.mockClear()

      await expect(
        plugin.hooks['before:remove:remove'](),
      ).resolves.toBeUndefined()
      expect(log.warning).toHaveBeenCalledWith(
        "Unable to remove the Route 53 records for 'shop.example.com':\nrecord not found",
      )
    })

    it('adds the DNS context when the alias has no hosted zone', async () => {
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue(outputs)
      jest
        .spyOn(Route53Client.prototype, 'send')
        .mockResolvedValue({ HostedZones: [] })

      await expect(plugin.hooks['after:deploy:deploy']()).rejects.toMatchObject(
        {
          code: 'ROUTE53_HOSTED_ZONE_NOT_FOUND',
          message: `Could not find hosted zone 'shop.example.com'\n${HOSTED_ZONE_CONTEXT}`,
        },
      )
    })

    it('logs at verbose level when the stack has no distribution output', async () => {
      Globals.v3Utils = { log }
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue({})
      const change = jest.spyOn(
        Route53Wrapper.prototype,
        'changeResourceRecordSet',
      )
      log.verbose.mockClear()

      await plugin.hooks['after:deploy:deploy']()

      expect(change).not.toHaveBeenCalled()
      expect(log.verbose).toHaveBeenCalledWith(
        'No ShopDotexampleDotcomCloudFrontDistributionDomainName output in the stack; skipping the Route 53 records for shop.example.com.',
      )
    })

    it('skips entries with createRoute53Record: false', async () => {
      const { plugin } = createPlugin({
        domains: [
          {
            name: 'shop.example.com',
            webApp: 'shop',
            createRoute53Record: false,
            certificateArn: CERT_ARN,
          },
        ],
      })
      const getOutputs = jest.spyOn(
        CloudFormationWrapper.prototype,
        'getStackOutputs',
      )
      const change = jest.spyOn(
        Route53Wrapper.prototype,
        'changeResourceRecordSet',
      )

      await plugin.hooks['after:deploy:deploy']()
      await plugin.hooks['before:remove:remove']()

      expect(getOutputs).not.toHaveBeenCalled()
      expect(change).not.toHaveBeenCalled()
    })

    it('leaves API Gateway base path mappings to the API Gateway entries', async () => {
      const { plugin } = createPlugin({
        domains: [{ name: 'shop.example.com', webApp: 'shop' }],
      })
      jest
        .spyOn(CloudFormationWrapper.prototype, 'getStackOutputs')
        .mockResolvedValue(outputs)
      jest
        .spyOn(Route53Wrapper.prototype, 'changeResourceRecordSet')
        .mockResolvedValue()
      const findApiId = jest.spyOn(CloudFormationWrapper.prototype, 'findApiId')

      await plugin.hooks['after:deploy:deploy']()
      await plugin.hooks['before:remove:remove']()

      expect(findApiId).not.toHaveBeenCalled()
    })
  })
})

describe('createDomain after the certificate extraction', () => {
  it('uses a found certificate without waiting for validation', async () => {
    const { plugin } = createPlugin({
      domains: [{ name: 'api.example.com', apiType: 'http' }],
    })
    plugin.initializeVariables()
    await plugin.initSLSCredentials()
    await plugin.initAWSRegion()
    await plugin.initAWSResources()
    jest
      .spyOn(APIGatewayV2Wrapper.prototype, 'getCustomDomain')
      .mockResolvedValue(undefined)
    const getCertificate = jest
      .spyOn(ACMWrapper.prototype, 'getCertificate')
      .mockResolvedValue({ arn: CERT_ARN, status: 'PENDING_VALIDATION' })
    const wait = jest.spyOn(
      ACMWrapper.prototype,
      'waitForCertificateValidation',
    )
    const create = jest
      .spyOn(APIGatewayV2Wrapper.prototype, 'createCustomDomain')
      .mockResolvedValue({ domainName: 'd.example.net', hostedZoneId: 'Z1' })
    jest
      .spyOn(Route53Wrapper.prototype, 'changeResourceRecordSet')
      .mockResolvedValue()

    await plugin.createDomain(plugin.domains[0])

    expect(getCertificate).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
    expect(create.mock.calls[0][0].certificateArn).toBe(CERT_ARN)
  })
})

describe('CloudFormationWrapper.getStackOutputs', () => {
  it('returns the stack outputs by key', async () => {
    Globals.serverless = createServerless()
    Globals.options = { stage: 'dev' }
    const wrapper = new CloudFormationWrapper()
    const send = jest
      .spyOn(CloudFormationClient.prototype, 'send')
      .mockResolvedValue({
        Stacks: [
          {
            Outputs: [
              { OutputKey: 'A', OutputValue: '1' },
              { OutputKey: 'B', OutputValue: '2' },
            ],
          },
        ],
      })

    await expect(wrapper.getStackOutputs()).resolves.toEqual({
      A: '1',
      B: '2',
    })
    expect(send.mock.calls[0][0]).toBeInstanceOf(DescribeStacksCommand)
    expect(send.mock.calls[0][0].input).toEqual({ StackName: 'shop-dev' })
  })
})
