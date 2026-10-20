/**
 * With `configValidationMode: warn` (the default) a schema error is only a
 * warning and the command goes on. Each configuration here passes the real
 * schema validation in warn mode, and the web-apps plugin's own validation,
 * which runs in every mode, must then stop it with a clean error rather than
 * let packaging reach it.
 */

import { jest } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { log } from '@serverless/util'

// The real ConfigSchemaHandler caches its compiled validator on disk; keep it
// out of the developer's home directory (see validators/schema.test.js).
let schemaCacheDir
let previousSchemaCacheBaseDir
let serviceDir
// Warnings (the schema's in warn mode, the commands' own) are recorded, not printed
let warning

beforeAll(() => {
  warning = jest.spyOn(log, 'warning').mockImplementation(() => {})
  schemaCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-schema-cache-'))
  previousSchemaCacheBaseDir = process.env.SLS_SCHEMA_CACHE_BASE_DIR
  process.env.SLS_SCHEMA_CACHE_BASE_DIR = schemaCacheDir
  serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-web-apps-warn-'))
  fs.mkdirSync(path.join(serviceDir, 'src'))
  fs.writeFileSync(path.join(serviceDir, 'src', 'server.js'), '')
})

beforeEach(() => {
  warning.mockClear()
})

afterAll(() => {
  warning.mockRestore()
  if (previousSchemaCacheBaseDir === undefined) {
    delete process.env.SLS_SCHEMA_CACHE_BASE_DIR
  } else {
    process.env.SLS_SCHEMA_CACHE_BASE_DIR = previousSchemaCacheBaseDir
  }
  fs.rmSync(schemaCacheDir, { recursive: true, force: true })
  fs.rmSync(serviceDir, { recursive: true, force: true })
})

const { default: Serverless } =
  await import('../../../../../../lib/serverless.js')
const { default: AwsProvider } =
  await import('../../../../../../lib/plugins/aws/provider.js')
const { default: ServerlessWebApps } =
  await import('../../../../../../lib/plugins/aws/web-apps/index.js')
const { default: AwsInvokeWebApp } =
  await import('../../../../../../lib/plugins/aws/invoke-web-app.js')
const { default: AwsLogsWebApp } =
  await import('../../../../../../lib/plugins/aws/logs-web-app.js')
const { default: ServerlessCustomDomain } =
  await import('../../../../../../lib/plugins/aws/domains/index.js')
const { formatEndpoints } =
  await import('../../../../../../lib/plugins/aws/info/endpoints.js')
const { buildWebAppsAnalytics } =
  await import('../../../../../../lib/plugins/aws/web-apps/analytics.js')
const { default: rolesPerFunctionMixin } =
  await import('../../../../../../lib/plugins/aws/package/lib/roles-per-function.js')

/**
 * A real Serverless instance for the service, with the web-apps plugin
 * constructed (which defines its schema) and the configuration validated
 * against the real schema in warn mode.
 */
const givenWarnModeService = async ({ webApps, functions, provider = {} }) => {
  const configurationInput = {
    service: 'shop',
    configValidationMode: 'warn',
    provider: { name: 'aws', region: 'us-east-1', ...provider },
    webApps,
  }
  if (functions) configurationInput.functions = functions
  const serverless = new Serverless({
    commands: [],
    options: {},
    servicePath: serviceDir,
    serviceConfigFileName: 'serverless.yml',
    service: configurationInput,
  })
  serverless.credentialProviders = { aws: { getCredentials: jest.fn() } }
  serverless.service.loadServiceFileParam()
  serverless.setProvider(
    'aws',
    new AwsProvider(serverless, { stage: 'dev', region: 'us-east-1' }),
  )
  const plugin = new ServerlessWebApps(serverless, {}, { log: {} })
  // Warn mode: a schema error is logged, never thrown
  await serverless.configSchemaHandler.validateConfig(configurationInput)
  return { serverless, plugin }
}

/** The error the package step's first web-apps hook throws, if any. */
const packageValidationError = async (config) => {
  const { plugin } = await givenWarnModeService(config)
  try {
    await plugin.hooks['before:package:initialize']()
  } catch (error) {
    return error
  }
  return undefined
}

describe('web apps in configValidationMode: warn', () => {
  jest.setTimeout(60_000)

  it.each([
    ['an older Node.js version', 'nodejs22.x'],
    ['an older Node.js version', 'nodejs20.x'],
    ['a non-Node runtime', 'python3.13'],
    ['a runtime that is not a Lambda identifier', 'node24'],
  ])('stops package for %s (%s)', async (_title, runtime) => {
    const error = await packageValidationError({
      webApps: { api: { entry: 'src/server.js', runtime } },
    })
    expect(error).not.toBeInstanceOf(TypeError)
    expect(error).toMatchObject({
      code: 'WEB_APPS_VALIDATION_ERROR',
      stack: undefined,
      message: 'webApps.api.runtime must be nodejs24.x or newer (nodejsNN.x).',
    })
  })

  it.each(['nodejs24.x', 'nodejs26.x', 'nodejs30.x'])(
    'lets runtime %s through',
    async (runtime) => {
      expect(
        await packageValidationError({
          webApps: { api: { entry: 'src/server.js', runtime } },
        }),
      ).toBeUndefined()
    },
  )

  // Each shape passes the schema in warn mode (as a warning) and, before
  // these checks, reached packaging, where it threw a TypeError or compiled a
  // template that cannot deploy.
  it.each([
    [
      'a web app that is a string',
      { webApps: { frontend: 's3://my-static-site' } },
      'webApps.frontend must be an object with an entry file path.',
    ],
    [
      'a web app with no value',
      { webApps: { frontend: null } },
      'webApps.frontend must be an object with an entry file path.',
    ],
    [
      'a web app without entry',
      { webApps: { frontend: { bucket: 'my-static-site' } } },
      'webApps.frontend.entry must be a file path, for example src/server.js.',
    ],
    [
      'webApps as a list',
      { webApps: [{ entry: 'src/server.js' }] },
      'webApps must be an object with one entry per web app, for example api: { entry: src/server.js }.',
    ],
    [
      'url as a string',
      { webApps: { api: { entry: 'src/server.js', url: 'public' } } },
      'webApps.api.url must be true or an object of endpoint settings.',
    ],
    [
      'environment as a string',
      { webApps: { api: { entry: 'src/server.js', environment: 'FOO=bar' } } },
      'webApps.api.environment must be an object of variable names and values.',
    ],
    [
      'vpc as a string',
      { webApps: { api: { entry: 'src/server.js', vpc: 'vpc-123' } } },
      'webApps.api.vpc must be an object with securityGroupIds and subnetIds.',
    ],
    [
      'package as a string',
      { webApps: { api: { entry: 'src/server.js', package: 'src/**' } } },
      'webApps.api.package must be an object with patterns or artifact.',
    ],
    [
      'build as an object',
      {
        webApps: {
          api: { entry: 'src/server.js', build: { esbuild: { minify: true } } },
        },
      },
      'webApps.api.build must be false or the name of a build tool, for example esbuild.',
    ],
    [
      'build: true',
      { webApps: { api: { entry: 'src/server.js', build: true } } },
      'webApps.api.build must be false or the name of a build tool, for example esbuild.',
    ],
    [
      'logs as a string',
      { webApps: { api: { entry: 'src/server.js', logs: 'info' } } },
      'webApps.api.logs must be an object, for example applicationLogLevel: info.',
    ],
    [
      'a log level as an intrinsic',
      {
        webApps: {
          api: {
            entry: 'src/server.js',
            logs: { applicationLogLevel: { Ref: 'Level' } },
          },
        },
      },
      'webApps.api.logs.applicationLogLevel must be one of: trace, debug, info, warn, error, fatal.',
    ],
    [
      'tags as a list',
      { webApps: { api: { entry: 'src/server.js', tags: ['team'] } } },
      'webApps.api.tags must be an object of tag names and values.',
    ],
    [
      'name as an object',
      { webApps: { api: { entry: 'src/server.js', name: { a: 'b' } } } },
      'webApps.api.name must be letters, digits, - and _, up to 64 characters.',
    ],
    [
      'timeout that is not a number',
      { webApps: { api: { entry: 'src/server.js', timeout: 'soon' } } },
      'webApps.api.timeout must be a whole number of seconds from 3 to 900.',
    ],
    [
      'a runtime intrinsic',
      {
        webApps: { api: { entry: 'src/server.js', runtime: { Ref: 'Rt' } } },
      },
      'webApps.api.runtime must be nodejs24.x or newer (nodejsNN.x).',
    ],
    ...[
      ['iamRoleStatements', [], 'iam.role.statements'],
      ['iamRoleStatementsInherit', true, 'iam.inheritStatements'],
      ['iamRoleStatementsName', 'api-role', 'iam.role.name'],
      [
        'iamPermissionsBoundary',
        'arn:aws:iam::123456789012:policy/boundary',
        'iam.role.permissionsBoundary',
      ],
    ].map(([key, value, replacement]) => [
      `the older function key ${key}`,
      { webApps: { api: { entry: 'src/server.js', [key]: value } } },
      `webApps.api.${key} is not supported on web apps. Use webApps.api.${replacement}.`,
    ]),
    [
      "a function whose log group logical ID is a web app's",
      {
        functions: { apiWebFunction: { handler: 'src/handler.hello' } },
        webApps: { api: { entry: 'src/server.js' } },
      },
      "webApps.api and functions.apiWebFunction would both use the CloudFormation logical ID ApiWebFunctionLogGroup, so one's resources would replace the other's. Rename one of them.",
    ],
    [
      'url.maxEnvironments that is not a number',
      {
        webApps: {
          api: { entry: 'src/server.js', url: { maxEnvironments: 'many' } },
        },
      },
      'webApps.api.url.maxEnvironments must be a whole number from 2 to 10000.',
    ],
    [
      'a url.rateLimit Lambda does not accept',
      { webApps: { api: { entry: 'src/server.js', url: { rateLimit: 150 } } } },
      'webApps.api.url.rateLimit must be 0, 100 to 1000 in steps of 100, or 2000 to 10000 in steps of 1000.',
    ],
    [
      'a domain entry without a hostname',
      {
        provider: { domains: [{ webApp: 'api' }] },
        webApps: { api: { entry: 'src/server.js' } },
      },
      'provider.domains[0] (webApp: api) needs a hostname. Set name to the domain to serve it on.',
    ],
    [
      'a domain entry whose webApp is not a name',
      {
        provider: {
          domains: [{ name: 'shop.example.com', webApp: { name: 'api' } }],
        },
        webApps: { api: { entry: 'src/server.js' } },
      },
      'provider.domains[0].webApp must be the name of a web app in this service. Web apps: api.',
    ],
  ])('stops package cleanly for %s', async (_title, config, message) => {
    const error = await packageValidationError(config)
    expect(error).not.toBeInstanceOf(TypeError)
    expect(error).toMatchObject({
      code: 'WEB_APPS_VALIDATION_ERROR',
      stack: undefined,
    })
    expect(error.message.split('\n')).toContain(message)
  })

  // The role step at the end of package reads each statement. An empty `-`
  // item in YAML is null.
  describe('an IAM statement that is not an object', () => {
    /** The error the package step that creates the dedicated roles throws. */
    const roleStepError = (serverless) => {
      const roles = {
        serverless,
        provider: serverless.getProvider('aws'),
        ...rolesPerFunctionMixin,
      }
      try {
        roles.createRolesPerFunction()
      } catch (error) {
        return error
      }
      return undefined
    }

    it('stops package without a stack trace for a web app', async () => {
      const config = {
        webApps: {
          api: {
            entry: 'src/server.js',
            iam: { role: { statements: [null] } },
          },
        },
      }
      expect(await packageValidationError(config)).toBeUndefined()
      const { serverless } = await givenWarnModeService(config)
      expect(warning).toHaveBeenCalled()

      const error = roleStepError(serverless)
      expect(error).not.toBeInstanceOf(TypeError)
      expect(error).toMatchObject({
        code: 'INVALID_IAM_ROLE_STATEMENTS',
        stack: undefined,
        message:
          'webApps.api.iam.role.statements should be an array of objects, where each object has Effect, Action / NotAction, Resource / NotResource fields. Specifically, statement 0 is not an object',
      })
    })

    it('stops package without a stack trace for a function', async () => {
      const { serverless } = await givenWarnModeService({
        functions: {
          hello: {
            handler: 'src/handler.hello',
            iam: { role: { statements: [null] } },
          },
        },
      })
      expect(warning).toHaveBeenCalled()

      const error = roleStepError(serverless)
      expect(error).not.toBeInstanceOf(TypeError)
      expect(error).toMatchObject({
        code: 'INVALID_IAM_ROLE_STATEMENTS',
        stack: undefined,
        message:
          'functions.hello.iam.role.statements should be an array of objects, where each object has Effect, Action / NotAction, Resource / NotResource fields. Specifically, statement 0 is not an object',
      })
    })
  })

  it('lets package through a domain list with a stray null entry', async () => {
    expect(
      await packageValidationError({
        provider: {
          domains: [null, { name: 'shop.example.com', webApp: 'api' }],
        },
        webApps: { api: { entry: 'src/server.js' } },
      }),
    ).toBeUndefined()
  })

  describe('commands that read web apps without package', () => {
    const pluginUtils = () => ({
      log: { notice: jest.fn(), aside: jest.fn(), warning: jest.fn() },
      progress: { notice: jest.fn(), remove: jest.fn() },
    })

    it.each([
      ['no value', null],
      ['a string', 's3://my-static-site'],
    ])(
      'invoke --web-app and logs --web-app reject a web app with %s',
      async (_title, webApp) => {
        const { serverless } = await givenWarnModeService({
          webApps: { frontend: webApp },
        })
        const message =
          'webApps.frontend must be an object with an entry file path.'

        const invoke = new AwsInvokeWebApp(
          serverless,
          { 'web-app': 'frontend' },
          pluginUtils(),
        )
        await expect(invoke.hooks['invoke:invoke']()).rejects.toMatchObject({
          code: 'WEB_APPS_VALIDATION_ERROR',
          stack: undefined,
          message,
        })

        const logs = new AwsLogsWebApp(
          serverless,
          { 'web-app': 'frontend' },
          pluginUtils(),
        )
        await expect(logs.hooks['logs:logs']()).rejects.toMatchObject({
          code: 'WEB_APPS_VALIDATION_ERROR',
          stack: undefined,
          message,
        })
      },
    )

    const HOSTLESS = {
      provider: { domains: [{ webApp: 'api' }] },
      webApps: { api: { entry: 'src/server.js' } },
    }
    const HOSTLESS_MESSAGE =
      'provider.domains[0] (webApp: api) needs a hostname. Set name to the domain to serve it on.'

    it('invoke --web-app skips a domain entry without a hostname with a warning', async () => {
      const { serverless } = await givenWarnModeService(HOSTLESS)
      serverless.getProvider('aws').request = jest.fn(async () => ({
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'ApiWebFunctionUrl',
                OutputValue: 'https://abc.lambda-web.us-east-1.on.aws',
              },
            ],
          },
        ],
      }))
      const utils = pluginUtils()
      const invoke = new AwsInvokeWebApp(
        serverless,
        { 'web-app': 'api' },
        utils,
      )
      // The skipped entry leaves the endpoint public, so the request is not signed
      expect(
        invoke.isIamAuth('api', serverless.configurationInput.webApps.api),
      ).toBe(false)
      expect(utils.log.warning).toHaveBeenCalledWith(
        `${HOSTLESS_MESSAGE} Skipping it.`,
      )
    })

    it('info skips a domain entry without a hostname with a warning', async () => {
      const { serverless } = await givenWarnModeService(HOSTLESS)
      expect(
        formatEndpoints({
          serverless,
          webApps: [
            { name: 'api', url: 'https://abc.lambda-web.us-east-1.on.aws' },
          ],
        }),
      ).toEqual(['https://abc.lambda-web.us-east-1.on.aws'])
      expect(warning).toHaveBeenCalledWith(`${HOSTLESS_MESSAGE} Skipping it.`)
    })

    /** The domains plugin, stopped where it would start talking to AWS. */
    const givenDomainsPlugin = (serverless) => {
      const domainsLog = { warning: jest.fn(), verbose: jest.fn() }
      const domains = new ServerlessCustomDomain(
        serverless,
        {},
        {
          log: domainsLog,
        },
      )
      const awsSetup = new Error('AWS setup reached')
      domains.initSLSCredentials = jest.fn(async () => {
        throw awsSetup
      })
      return { domains, domainsLog, awsSetup }
    }

    it('remove skips a domain entry without a hostname with a warning and goes on', async () => {
      const { serverless } = await givenWarnModeService(HOSTLESS)
      const { domains, domainsLog, awsSetup } = givenDomainsPlugin(serverless)
      await expect(domains.hooks['before:remove:remove']()).rejects.toBe(
        awsSetup,
      )
      expect(domainsLog.warning).toHaveBeenCalledWith(
        `${HOSTLESS_MESSAGE} Skipping it.`,
      )
      expect(domains.webAppDomains).toEqual([])
    })

    // Web-app entries the domains plugin cannot read. Their CloudFront
    // resources belong to the stack, so remove skips each with a warning and
    // a stack can always be removed.
    describe.each([
      [
        'an API Gateway-only key',
        { name: 'shop.example.com', webApp: 'api', apiType: 'http' },
        'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp.',
        // the message names the entry
        'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp. Skipping it.',
      ],
      [
        'an ambiguous enabled',
        { name: 'shop.example.com', webApp: 'api', enabled: 'maybe' },
        'domains: Ambiguous boolean config: "maybe"',
        'domains: Ambiguous boolean config: "maybe". Skipping provider.domains[0].',
      ],
      [
        'an API Gateway-only key and no hostname',
        { webApp: 'api', apiType: 'http' },
        'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp.',
        'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp. Skipping it.',
        'provider.domains[0].apiType applies to API Gateway domains only. Remove it from entries with webApp. Skipping it. Its Route 53 records, if the last deploy created any, may not be removed.',
      ],
      [
        // not a string, so not coerced in warn mode; a TypeError in the reader
        'a routingPolicy that is not a string',
        {
          name: 'shop.example.com',
          webApp: 'api',
          route53Params: { routingPolicy: { latency: true } },
        },
        'route53Params?.routingPolicy?.toLowerCase is not a function',
        'provider.domains[0] could not be read (route53Params?.routingPolicy?.toLowerCase is not a function). Skipping it.',
      ],
    ])(
      'a web-app domain entry with %s',
      (_title, entry, errorMessage, warningMessage, removeWarningMessage) => {
        const INVALID = {
          provider: { domains: [entry] },
          webApps: { api: { entry: 'src/server.js' } },
        }

        it('remove skips it with a warning and goes on', async () => {
          const { serverless } = await givenWarnModeService(INVALID)
          const { domains, domainsLog, awsSetup } =
            givenDomainsPlugin(serverless)
          await expect(domains.hooks['before:remove:remove']()).rejects.toBe(
            awsSetup,
          )
          // remove names what the skip leaves in place
          expect(domainsLog.warning).toHaveBeenCalledWith(
            removeWarningMessage ??
              `${warningMessage} Its Route 53 records for shop.example.com, if the last deploy created any, may not be removed.`,
          )
          expect(domains.webAppDomains).toEqual([])
        })

        it('info skips it in the domains step and goes on', async () => {
          const { serverless } = await givenWarnModeService(INVALID)
          const { domains, domainsLog, awsSetup } =
            givenDomainsPlugin(serverless)
          await expect(domains.hooks['after:info:info']()).rejects.toBe(
            awsSetup,
          )
          // info prints the warning once, with the endpoints
          expect(domainsLog.warning).not.toHaveBeenCalled()
          expect(domains.webAppDomains).toEqual([])
        })

        it.each(['before:deploy:deploy', 'after:deploy:deploy'])(
          'the domains step at %s stops on it',
          async (hook) => {
            const { serverless } = await givenWarnModeService(INVALID)
            const { domains } = givenDomainsPlugin(serverless)
            await expect(domains.hooks[hook]()).rejects.toMatchObject({
              message: errorMessage,
            })
            expect(domains.initSLSCredentials).not.toHaveBeenCalled()
          },
        )

        it('info and invoke --web-app skip it with a warning', async () => {
          const { serverless } = await givenWarnModeService(INVALID)
          expect(
            formatEndpoints({
              serverless,
              webApps: [
                { name: 'api', url: 'https://abc.lambda-web.us-east-1.on.aws' },
              ],
            }),
          ).toEqual(['https://abc.lambda-web.us-east-1.on.aws'])
          expect(warning).toHaveBeenCalledWith(warningMessage)

          const utils = pluginUtils()
          const invoke = new AwsInvokeWebApp(
            serverless,
            { 'web-app': 'api' },
            utils,
          )
          expect(
            invoke.isIamAuth('api', serverless.configurationInput.webApps.api),
          ).toBe(false)
          expect(utils.log.warning).toHaveBeenCalledWith(warningMessage)
        })
      },
    )

    // API Gateway entries are read as before web apps: an invalid one stops
    // every command that reads the entries, remove included
    describe.each([
      [
        'an ambiguous enabled',
        { name: 'api.example.com', apiType: 'http', enabled: 'maybe' },
        'domains: Ambiguous boolean config: "maybe"',
      ],
      [
        'an unsupported apiType',
        { name: 'api.example.com', apiType: 'graphql' },
        'graphql is not supported api type, use REST, HTTP or WEBSOCKET.',
      ],
    ])('an API Gateway domain entry with %s', (_title, entry, errorMessage) => {
      it.each([
        'before:remove:remove',
        'after:info:info',
        'before:deploy:deploy',
        'after:deploy:deploy',
      ])('the domains step at %s stops on it', async (hook) => {
        const { serverless } = await givenWarnModeService({
          provider: { domains: [entry] },
          webApps: { api: { entry: 'src/server.js' } },
        })
        const { domains, domainsLog } = givenDomainsPlugin(serverless)
        await expect(domains.hooks[hook]()).rejects.toMatchObject({
          message: errorMessage,
        })
        expect(domainsLog.warning).not.toHaveBeenCalled()
        expect(domains.initSLSCredentials).not.toHaveBeenCalled()
      })
    })

    it('info skips a domain entry without a hostname in the domains step and goes on', async () => {
      const { serverless } = await givenWarnModeService(HOSTLESS)
      const { domains, domainsLog, awsSetup } = givenDomainsPlugin(serverless)
      await expect(domains.hooks['after:info:info']()).rejects.toBe(awsSetup)
      // info prints the warning once, with the endpoints
      expect(domainsLog.warning).not.toHaveBeenCalled()
    })

    it.each(['before:deploy:deploy', 'after:deploy:deploy'])(
      'the domains step at %s stops on a domain entry without a hostname',
      async (hook) => {
        const { serverless } = await givenWarnModeService(HOSTLESS)
        const { domains } = givenDomainsPlugin(serverless)
        await expect(domains.hooks[hook]()).rejects.toMatchObject({
          code: 'WEB_APPS_VALIDATION_ERROR',
          stack: undefined,
          message: HOSTLESS_MESSAGE,
        })
        expect(domains.initSLSCredentials).not.toHaveBeenCalled()
      },
    )

    it('the deploy warning step stops on a domain entry without a hostname (deploy --package)', async () => {
      const { plugin } = await givenWarnModeService(HOSTLESS)
      plugin.log = { warning: jest.fn() }
      expect(() => plugin.hooks['before:deploy:deploy']()).toThrow(
        expect.objectContaining({
          code: 'WEB_APPS_VALIDATION_ERROR',
          stack: undefined,
          message: HOSTLESS_MESSAGE,
        }),
      )
    })

    // `enabled:` left empty is null; it reads as unset (enabled)
    describe('a domain entry with an empty enabled', () => {
      const WEB_APP_ENTRY = {
        provider: {
          domains: [{ name: 'shop.example.com', webApp: 'api', enabled: null }],
        },
        webApps: { api: { entry: 'src/server.js' } },
      }

      it('passes package and reads as enabled in info and remove', async () => {
        expect(await packageValidationError(WEB_APP_ENTRY)).toBeUndefined()
        const { serverless } = await givenWarnModeService(WEB_APP_ENTRY)
        expect(
          formatEndpoints({
            serverless,
            webApps: [
              { name: 'api', url: 'https://abc.lambda-web.us-east-1.on.aws' },
            ],
          }),
        ).toEqual([
          'api: https://abc.lambda-web.us-east-1.on.aws',
          'api: https://shop.example.com',
        ])
        const { domains, awsSetup } = givenDomainsPlugin(serverless)
        await expect(domains.hooks['before:remove:remove']()).rejects.toBe(
          awsSetup,
        )
        expect(domains.webAppDomains).toHaveLength(1)
      })

      it('reads as enabled on an API Gateway entry', async () => {
        const { serverless } = await givenWarnModeService({
          provider: {
            domains: [
              { name: 'api.example.com', apiType: 'http', enabled: null },
            ],
          },
          webApps: { api: { entry: 'src/server.js' } },
        })
        const { domains, awsSetup } = givenDomainsPlugin(serverless)
        await expect(domains.hooks['after:info:info']()).rejects.toBe(awsSetup)
        expect(domains.domains).toHaveLength(1)
        expect(domains.domains[0].enabled).toBe(true)
      })
    })

    it('remove deletes the log groups of malformed web apps without throwing', async () => {
      const { serverless, plugin } = await givenWarnModeService({
        webApps: {
          frontend: null,
          other: 's3://site',
          api: { name: { a: 1 } },
        },
      })
      const request = jest.fn(async (service, method, params) => {
        if (method === 'describeStackResource') {
          return {
            StackResourceDetail: {
              ResourceType: 'AWS::Logs::LogGroup',
              PhysicalResourceId: `/aws/lambda/web/${params.LogicalResourceId}`,
            },
          }
        }
        const error = new Error('not found')
        error.code = 'ResourceNotFoundException'
        throw error
      })
      serverless.getProvider('aws').request = request
      plugin.log = { debug: jest.fn(), warning: jest.fn() }
      await expect(
        plugin.hooks['before:remove:remove'](),
      ).resolves.toBeUndefined()
      await expect(
        plugin.hooks['after:remove:remove'](),
      ).resolves.toBeUndefined()
      expect(
        request.mock.calls.filter(([, method]) => method === 'deleteLogGroup'),
      ).toHaveLength(6)
    })

    it('analytics never throws on malformed web apps', async () => {
      const { serverless } = await givenWarnModeService({
        provider: { domains: [null, { webApp: 'api' }] },
        webApps: {
          frontend: null,
          other: 's3://site',
          api: { entry: 5, url: 'x', logs: 'info' },
        },
      })
      expect(
        buildWebAppsAnalytics(serverless.configurationInput, serviceDir),
      ).toMatchObject({ webApps: { count: 3 } })
    })
  })
})
