import { describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ServerlessWebApps from '../../../../../../lib/plugins/aws/web-apps/index.js'
import ServerlessError from '../../../../../../lib/serverless-error.js'
import { givenProvider, givenZip } from './given.js'

const makeServerless = ({
  webApps,
  functions = {},
  provider = {},
  packagePath,
} = {}) => ({
  serviceDir: '/svc',
  configurationInput: { webApps },
  service: {
    service: 'shop',
    functions,
    provider,
    package: packagePath ? { path: packagePath } : {},
  },
  getProvider: () => ({
    getStage: () => 'dev',
    getRegion: () => 'us-east-1',
  }),
  configSchemaHandler: { defineTopLevelProperty: jest.fn() },
  classes: { Error: ServerlessError },
})

const create = (config, options = {}) =>
  new ServerlessWebApps(makeServerless(config), options, { log: {} })

describe('ServerlessWebApps', () => {
  it('defines the webApps top-level schema', () => {
    const serverless = makeServerless()
    new ServerlessWebApps(serverless, {}, { log: {} })
    expect(
      serverless.configSchemaHandler.defineTopLevelProperty,
    ).toHaveBeenCalledWith('webApps', expect.any(Object))
  })

  it('validates at before:package:initialize', async () => {
    const plugin = create({ webApps: { api: { entry: 'src/server.ts' } } })
    const validate = jest.spyOn(plugin, 'validate')
    await plugin.hooks['before:package:initialize']()
    expect(validate).toHaveBeenCalledTimes(1)
  })

  // The plugin manager loads this plugin for every service: every hook must
  // return early when the service has no webApps. Hooks added later are
  // covered automatically.
  it('runs every hook as a no-op for a service without webApps', async () => {
    const serverless = makeServerless({ functions: { hello: {} } })
    const request = jest.fn()
    serverless.getProvider = () => ({
      getStage: () => 'dev',
      getRegion: () => 'us-east-1',
      request,
    })
    const plugin = new ServerlessWebApps(serverless, {}, { log: {} })
    const serviceBefore = structuredClone(serverless.service)

    expect(Object.keys(plugin.hooks)).toEqual(
      expect.arrayContaining([
        'before:remove:remove',
        'after:remove:remove',
        'before:deploy:function:initialize',
      ]),
    )
    for (const [name, hook] of Object.entries(plugin.hooks)) {
      await expect(Promise.resolve().then(hook)).resolves.toBeUndefined()
      expect({ name, service: serverless.service }).toEqual({
        name,
        service: serviceBefore,
      })
    }
    expect(request).not.toHaveBeenCalled()
  })

  describe('deploy function', () => {
    it('rejects a web app name and points to serverless deploy', async () => {
      const plugin = create(
        { webApps: { api: { entry: 'src/server.ts' } } },
        { function: 'api' },
      )
      const error = await Promise.resolve()
        .then(plugin.hooks['before:deploy:function:initialize'])
        .catch((e) => e)
      expect(error).toMatchObject({
        code: 'WEB_APPS_DEPLOY_FUNCTION',
        stack: undefined,
        message: '"api" is a web app. Deploy it with serverless deploy.',
      })
    })

    it('lets a function name through', async () => {
      const plugin = create(
        {
          webApps: { api: { entry: 'src/server.ts' } },
          functions: { hello: {} },
        },
        { function: 'hello' },
      )
      await expect(
        Promise.resolve().then(
          plugin.hooks['before:deploy:function:initialize'],
        ),
      ).resolves.toBeUndefined()
    })
  })

  it('returns the context', () => {
    expect(create().getContext()).toEqual({
      serviceName: 'shop',
      stage: 'dev',
      region: 'us-east-1',
      serviceDir: '/svc',
    })
  })

  describe('getPackageDir', () => {
    it('defaults to <serviceDir>/.serverless', () => {
      expect(create().getPackageDir()).toBe(path.join('/svc', '.serverless'))
    })

    it('uses --package relative to the service dir', () => {
      expect(create({}, { package: 'out' }).getPackageDir()).toBe(
        path.join('/svc', 'out'),
      )
    })

    it('uses an absolute package.path as is', () => {
      expect(create({ packagePath: '/abs/pkg' }).getPackageDir()).toBe(
        '/abs/pkg',
      )
    })
  })

  describe('compile', () => {
    it('runs at package:compileFunctions', async () => {
      const plugin = create({ webApps: { api: { entry: 'src/server.ts' } } })
      const compile = jest.spyOn(plugin, 'compile').mockResolvedValue()
      await plugin.hooks['package:compileFunctions']()
      expect(compile).toHaveBeenCalledTimes(1)
    })

    it('compiles the template and persists the packaged zip', async () => {
      const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-apps-'))
      try {
        const webAppsDir = path.join(serviceDir, '.serverless', 'webapps')
        fs.mkdirSync(webAppsDir, { recursive: true })
        await givenZip(path.join(webAppsDir, 'api.zip'), {
          'src/server.js': 'listen()',
        })
        const template = { Resources: {}, Outputs: {} }
        const provider = givenProvider({
          compiledCloudFormationTemplate: template,
        })
        const serverless = {
          ...provider.serverless,
          serviceDir,
          configurationInput: {
            webApps: { api: { entry: 'src/server.js' } },
          },
          getProvider: () => provider,
          classes: { Error: ServerlessError },
        }
        serverless.service.package = {}
        // `--package` is applied when the package step moves .serverless.
        const plugin = new ServerlessWebApps(
          serverless,
          { package: 'out' },
          { log: {} },
        )

        await plugin.compile()

        expect(Object.keys(template.Resources)).toEqual([
          'ApiWebFunction',
          'ApiWebFunctionRevision',
          'ApiWebFunctionEndpoint',
          'ApiWebFunctionLogGroup',
          'ApiWebFunctionLocalLogGroup',
        ])
        const [zip] = fs.readdirSync(webAppsDir)
        expect(zip).toMatch(/^api-[0-9a-f]{64}\.zip$/)
        expect(
          template.Resources.ApiWebFunctionRevision.Properties.BuildConfig
            .CodeConfig.S3Object.Key,
        ).toBe(`serverless/shop/dev/webapps/${zip}`)
        expect(
          fs.existsSync(
            path.join(serviceDir, '.serverless', 'webapps-uploads.json'),
          ),
        ).toBe(true)
        expect(fs.existsSync(path.join(serviceDir, 'out'))).toBe(false)
      } finally {
        fs.rmSync(serviceDir, { recursive: true, force: true })
      }
    })
  })

  describe('timeout warning behind a custom domain', () => {
    const WARNING =
      "webApps.api can run for 300 seconds, but through shop.example.com CloudFront waits at most 120 seconds for a response to start and between response bytes. Longer requests work only on the web app's own endpoint."
    const domains = [{ name: 'shop.example.com', webApp: 'api' }]

    it('warns at deploy when the package step did not run (deploy --package)', async () => {
      const serverless = makeServerless({
        webApps: { api: { entry: 'src/server.js', timeout: 300 } },
        provider: { domains },
      })
      const log = { warning: jest.fn() }
      const plugin = new ServerlessWebApps(serverless, {}, { log })

      await plugin.hooks['before:deploy:deploy']()

      expect(log.warning.mock.calls).toEqual([[WARNING]])
    })

    it('warns once in a deploy that packages first', async () => {
      const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-apps-'))
      try {
        const webAppsDir = path.join(serviceDir, '.serverless', 'webapps')
        fs.mkdirSync(webAppsDir, { recursive: true })
        await givenZip(path.join(webAppsDir, 'api.zip'), {
          'src/server.js': 'listen()',
        })
        const provider = givenProvider({
          compiledCloudFormationTemplate: { Resources: {}, Outputs: {} },
          domains,
        })
        const serverless = {
          ...provider.serverless,
          serviceDir,
          configurationInput: {
            webApps: { api: { entry: 'src/server.js', timeout: 300 } },
          },
          getProvider: () => provider,
          classes: { Error: ServerlessError },
        }
        serverless.service.package = {}
        const log = { warning: jest.fn() }
        const plugin = new ServerlessWebApps(serverless, {}, { log })

        await plugin.hooks['package:compileFunctions']()
        await plugin.hooks['before:deploy:deploy']()

        expect(log.warning.mock.calls).toEqual([[WARNING]])
      } finally {
        fs.rmSync(serviceDir, { recursive: true, force: true })
      }
    })

    it('does not warn at 115 seconds', async () => {
      const serverless = makeServerless({
        webApps: { api: { entry: 'src/server.js', timeout: 115 } },
        provider: { domains },
      })
      const log = { warning: jest.fn() }
      const plugin = new ServerlessWebApps(serverless, {}, { log })

      await plugin.hooks['before:deploy:deploy']()

      expect(log.warning).not.toHaveBeenCalled()
    })
  })

  describe('uploadArtifacts', () => {
    const apiKey = `serverless/shop/dev/webapps/api-${'a'.repeat(64)}.zip`
    const siteKey = `serverless/shop/dev/webapps/site-${'b'.repeat(64)}.zip`

    const givenPackageDir = (manifest, files = {}) => {
      const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-apps-'))
      fs.mkdirSync(path.join(packageDir, 'webapps'))
      for (const [file, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(packageDir, file), content)
      }
      fs.writeFileSync(
        path.join(packageDir, 'webapps-uploads.json'),
        JSON.stringify(manifest),
      )
      return packageDir
    }

    const givenPlugin = ({ packageDir, existingKeys = [], provider = {} }) => {
      const request = jest.fn(async (service, method, params) => {
        if (method === 'headObject') {
          if (existingKeys.includes(params.Key)) return {}
          throw Object.assign(new Error('Not Found'), {
            providerError: { statusCode: 404, code: 'NotFound' },
          })
        }
        return {}
      })
      const serverless = makeServerless({
        webApps: { api: { entry: 'a.js' }, site: { entry: 's.js' } },
        provider,
      })
      serverless.getProvider = () => ({
        getStage: () => 'dev',
        getRegion: () => 'us-east-1',
        getServerlessDeploymentBucketName: async () => 'dep-bucket',
        request,
      })
      const plugin = new ServerlessWebApps(
        serverless,
        { package: packageDir },
        { log: { debug: jest.fn() } },
      )
      return { plugin, request }
    }

    const twoWebApps = () =>
      givenPackageDir(
        [
          {
            name: 'api',
            key: apiKey,
            file: `webapps/${path.basename(apiKey)}`,
          },
          {
            name: 'site',
            key: siteKey,
            file: `webapps/${path.basename(siteKey)}`,
          },
        ],
        {
          [`webapps/${path.basename(apiKey)}`]: 'api zip',
          [`webapps/${path.basename(siteKey)}`]: 'site zip',
        },
      )

    it('runs at aws:deploy:deploy:uploadArtifacts', async () => {
      const plugin = create({ webApps: { api: { entry: 'src/server.ts' } } })
      const upload = jest.spyOn(plugin, 'uploadArtifacts').mockResolvedValue()
      await plugin.hooks['aws:deploy:deploy:uploadArtifacts']()
      expect(upload).toHaveBeenCalledTimes(1)
    })

    it('checks every key and uploads only the missing ones', async () => {
      const packageDir = twoWebApps()
      try {
        const { plugin, request } = givenPlugin({
          packageDir,
          existingKeys: [apiKey],
          provider: {
            deploymentBucketObject: { serverSideEncryption: 'AES256' },
          },
        })

        await plugin.uploadArtifacts()

        const heads = request.mock.calls
          .filter(([, method]) => method === 'headObject')
          .map(([, , params]) => params)
        expect(heads).toEqual(
          expect.arrayContaining([
            { Bucket: 'dep-bucket', Key: apiKey },
            { Bucket: 'dep-bucket', Key: siteKey },
          ]),
        )
        expect(heads).toHaveLength(2)
        const uploads = request.mock.calls.filter(
          ([, method]) => method === 'upload',
        )
        expect(uploads).toHaveLength(1)
        expect(uploads[0][2]).toMatchObject({
          Bucket: 'dep-bucket',
          Key: siteKey,
          ContentType: 'application/zip',
          ServerSideEncryption: 'AES256',
        })
        expect(String(uploads[0][2].Body)).toBe('site zip')
      } finally {
        fs.rmSync(packageDir, { recursive: true, force: true })
      }
    })

    it('makes no S3 call when the deploy is skipped', async () => {
      const packageDir = twoWebApps()
      try {
        const { plugin, request } = givenPlugin({
          packageDir,
          provider: { shouldNotDeploy: true },
        })

        await plugin.uploadArtifacts()

        expect(request).not.toHaveBeenCalled()
      } finally {
        fs.rmSync(packageDir, { recursive: true, force: true })
      }
    })

    it('refuses a manifest path outside the package directory', async () => {
      const packageDir = givenPackageDir([
        { name: 'api', key: apiKey, file: '../../etc/passwd' },
      ])
      try {
        const { plugin, request } = givenPlugin({ packageDir })

        await expect(plugin.uploadArtifacts()).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_PATH_ESCAPE',
          stack: undefined,
        })
        expect(
          request.mock.calls.filter(([, method]) => method === 'upload'),
        ).toEqual([])
      } finally {
        fs.rmSync(packageDir, { recursive: true, force: true })
      }
    })

    it('reports a listed zip missing from the package directory', async () => {
      const packageDir = givenPackageDir([
        { name: 'api', key: apiKey, file: `webapps/${path.basename(apiKey)}` },
      ])
      try {
        const { plugin } = givenPlugin({ packageDir })

        await expect(plugin.uploadArtifacts()).rejects.toMatchObject({
          code: 'WEB_APPS_ARTIFACT_MISSING',
          stack: undefined,
        })
      } finally {
        fs.rmSync(packageDir, { recursive: true, force: true })
      }
    })
  })

  describe('removeLogGroups', () => {
    const givenRemovePlugin = (request) => {
      const serverless = makeServerless({
        webApps: { api: { entry: 'a.js' }, site: { entry: 's.js' } },
      })
      serverless.service.webApps = serverless.configurationInput.webApps
      serverless.getProvider = () => ({
        getStage: () => 'prod',
        getRegion: () => 'eu-west-1',
        naming: { getStackName: () => 'shop-prod' },
        request,
      })
      return new ServerlessWebApps(
        serverless,
        {},
        { log: { debug: jest.fn(), warning: jest.fn() } },
      )
    }

    it('deletes, after the stack is removed, the web app log groups the stack held', async () => {
      // The stack holds the web app api only
      const request = jest.fn(async (service, method, params) => {
        if (method === 'deleteLogGroup') return {}
        expect([service, method, params.StackName]).toEqual([
          'CloudFormation',
          'describeStackResource',
          'shop-prod',
        ])
        const physicalIds = {
          ApiWebFunctionLogGroup: '/aws/lambda/web/shop-prod-api',
          ApiWebFunctionLocalLogGroup: '/aws/lambda/web/shop-prod-api.local',
        }
        const physicalId = physicalIds[params.LogicalResourceId]
        if (!physicalId) {
          throw new Error(
            `Resource ${params.LogicalResourceId} does not exist for stack shop-prod`,
          )
        }
        return {
          StackResourceDetail: {
            ResourceType: 'AWS::Logs::LogGroup',
            PhysicalResourceId: physicalId,
          },
        }
      })
      const plugin = givenRemovePlugin(request)

      await plugin.hooks['before:remove:remove']()
      expect(
        request.mock.calls.filter(([, method]) => method === 'deleteLogGroup'),
      ).toEqual([])
      await plugin.hooks['after:remove:remove']()

      expect(
        request.mock.calls
          .filter(([, method]) => method === 'deleteLogGroup')
          .map(([service, , { logGroupName }]) => {
            expect(service).toBe('CloudWatchLogs')
            return logGroupName
          })
          .sort(),
      ).toEqual([
        '/aws/lambda/web/shop-prod-api',
        '/aws/lambda/web/shop-prod-api.local',
      ])
    })

    it('deletes no log group when the stack does not exist', async () => {
      const request = jest.fn(async (service, method) => {
        if (method === 'deleteLogGroup') return {}
        throw new Error("Stack 'shop-prod' does not exist")
      })
      const plugin = givenRemovePlugin(request)

      await plugin.hooks['before:remove:remove']()
      await plugin.hooks['after:remove:remove']()

      expect(
        request.mock.calls.filter(([, method]) => method === 'deleteLogGroup'),
      ).toEqual([])
    })
  })

  describe('validate', () => {
    it('does nothing without web apps', () => {
      expect(() => create().validate()).not.toThrow()
    })

    it('passes a valid service', () => {
      expect(() =>
        create({
          webApps: { api: { entry: 'src/server.ts', timeout: 30 } },
        }).validate(),
      ).not.toThrow()
    })

    it('throws one error joining every message', () => {
      let error
      try {
        create({
          webApps: {
            api: {
              entry: 'src/server.ts',
              environment: { PORT: '1', AWS_REGION: 'x' },
            },
          },
          functions: { api: { handler: 'h.main' } },
          provider: { timeout: 1000 },
        }).validate()
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(ServerlessError)
      expect(error.code).toBe('WEB_APPS_VALIDATION_ERROR')
      expect(error.stack).toBeUndefined()
      expect(error.message.split('\n')).toEqual([
        'webApps.api and functions.api use the same name, so both would be deployed as the Lambda function "shop-dev-api". Rename one of them.',
        'webApps.api inherits provider.timeout (1000 seconds), and web functions accept 3–900. Set webApps.api.timeout.',
        'webApps.api.environment.PORT is set by the Framework from the Lambda listen address. Remove it and read process.env.PORT in your server.',
        'webApps.api.environment: AWS_REGION is set by AWS Lambda and cannot be overridden.',
      ])
    })

    it('points to iam.inheritStatements when provider.iam.role.statements is set', () => {
      expect(() =>
        create({
          webApps: { api: { entry: 'src/server.ts', iamRoleStatements: [] } },
          provider: {
            iam: {
              role: {
                statements: [
                  {
                    Effect: 'Allow',
                    Action: 'dynamodb:GetItem',
                    Resource: '*',
                  },
                ],
              },
            },
          },
        }).validate(),
      ).toThrow(
        new ServerlessError(
          'webApps.api.iamRoleStatements is not supported on web apps. Use webApps.api.iam.role.statements, and add webApps.api.iam.inheritStatements: true to keep provider.iam.role.statements.',
          'WEB_APPS_VALIDATION_ERROR',
        ),
      )
    })

    it('joins the domain entry messages into the same error', () => {
      expect(() =>
        create({
          webApps: { api: { entry: 'src/server.ts', timeout: 30 } },
          provider: {
            domains: [
              'other.example.com',
              { name: 'shop.example.com', webApp: 'shop' },
            ],
          },
        }).validate(),
      ).toThrow(
        new ServerlessError(
          'provider.domains[1].webApp: no web app named "shop" in this service. Web apps: api.',
          'WEB_APPS_VALIDATION_ERROR',
        ),
      )
    })

    it('validates webApp domain entries in a service without web apps', () => {
      expect(() =>
        create({
          provider: { domain: { name: 'shop.example.com', webApp: 'shop' } },
        }).validate(),
      ).toThrow(
        'provider.domain.webApp: no web app named "shop" in this service. Web apps: none.',
      )
    })
  })
})
