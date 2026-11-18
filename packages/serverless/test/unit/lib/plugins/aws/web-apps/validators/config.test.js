import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { validateWebApps } from '../../../../../../../lib/plugins/aws/web-apps/validators/config.js'
import {
  MIN_NODE_MAJOR_VERSION,
  RUNTIME_PATTERN,
  RUNTIME_RULE,
} from '../../../../../../../lib/plugins/aws/web-apps/constants.js'

let serviceDir

beforeAll(() => {
  serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-web-apps-config-'))
  fs.mkdirSync(path.join(serviceDir, 'src'))
  fs.writeFileSync(path.join(serviceDir, 'src', 'server.ts'), '')
})

afterAll(() => {
  fs.rmSync(serviceDir, { recursive: true, force: true })
})

const run = ({ webApps, functions, provider = {} }) =>
  validateWebApps({
    webApps,
    functions,
    provider,
    serviceName: 'shop',
    stage: 'dev',
    serviceDir,
  })

const app = (extra = {}) => ({ entry: 'src/server.ts', ...extra })

describe('validateWebApps', () => {
  it('returns no messages for a valid web app', () => {
    expect(run({ webApps: { api: app() } })).toEqual([])
  })

  it.each([
    '/srv/app/server.js',
    '../x.js',
    'src/../../x.js',
    'src\\..\\x.js',
    'C:\\app\\server.js',
  ])('rejects an entry outside the service directory (%s)', (entry) => {
    expect(run({ webApps: { api: app({ entry }) } })).toEqual([
      'webApps.api.entry must be a path inside the service directory, for example src/server.js.',
    ])
  })

  it('accepts an entry whose name only contains two dots', () => {
    fs.writeFileSync(path.join(serviceDir, 'src', 'a..b.js'), '')
    expect(run({ webApps: { api: app({ entry: 'src/a..b.js' }) } })).toEqual([])
  })

  it("rejects a function whose name is a web app's Lambda function name", () => {
    expect(
      run({
        webApps: { api: app() },
        functions: { hello: { handler: 'h.main', name: 'shop-dev-api' } },
      }),
    ).toEqual([
      'webApps.api and functions.hello use the same Lambda function name, so both would be deployed as the Lambda function "shop-dev-api". Rename one of them.',
    ])
  })

  it("rejects a web app whose name is a function's Lambda function name", () => {
    expect(
      run({
        webApps: { api: app({ name: 'shop-dev-hello' }) },
        functions: { hello: { handler: 'h.main' } },
      }),
    ).toEqual([
      'webApps.api and functions.hello use the same Lambda function name, so both would be deployed as the Lambda function "shop-dev-hello". Rename one of them.',
    ])
  })

  it('rejects matching explicit names', () => {
    expect(
      run({
        webApps: { api: app({ name: 'storefront' }) },
        functions: { hello: { handler: 'h.main', name: 'storefront' } },
      }),
    ).toEqual([
      'webApps.api and functions.hello use the same Lambda function name, so both would be deployed as the Lambda function "storefront". Rename one of them.',
    ])
  })

  it('accepts distinct names', () => {
    expect(
      run({
        webApps: { api: app({ name: 'storefront' }) },
        functions: {
          hello: { handler: 'h.main', name: 'shop-dev-hello' },
          api2: { handler: 'h.main', name: { 'Fn::Sub': 'storefront' } },
        },
      }),
    ).toEqual([])
  })

  it('rejects a key used in both functions and webApps', () => {
    expect(
      run({
        webApps: { api: app() },
        functions: { api: { handler: 'h.main' } },
      }),
    ).toEqual([
      'webApps.api and functions.api use the same name, so both would be deployed as the Lambda function "shop-dev-api". Rename one of them.',
    ])
  })

  it('accepts functions with other names', () => {
    expect(
      run({
        webApps: { api: app() },
        functions: { worker: { handler: 'h.main' } },
      }),
    ).toEqual([])
  })

  // The web app api's resources are ApiWebFunction<suffix>; a function's are
  // <NormalizedKey><suffix>, so these keys reach the same IDs
  it.each([
    ['apiWebFunction', 'ApiWebFunctionLogGroup'],
    ['apiWebFunctionLocal', 'ApiWebFunctionLocalLogGroup'],
  ])(
    "rejects function %s, whose log group logical ID is one of the web app's",
    (functionKey, logicalId) => {
      expect(
        run({
          webApps: { api: app() },
          functions: { [functionKey]: { handler: 'h.main' } },
        }),
      ).toEqual([
        `webApps.api and functions.${functionKey} would both use the CloudFormation logical ID ${logicalId}, so one's resources would replace the other's. Rename one of them.`,
      ])
    },
  )

  it("accepts functions whose logical IDs only start like a web app's", () => {
    expect(
      run({
        webApps: { api: app() },
        functions: {
          apiWebFunctionHandler: { handler: 'h.main' },
          apiWeb: { handler: 'h.main' },
          'api-WebFunction': { handler: 'h.main' },
          webFunction: { handler: 'h.main' },
        },
      }),
    ).toEqual([])
  })

  it.each(['PORT', 'HOSTNAME'])('rejects %s in the environment', (key) => {
    expect(
      run({ webApps: { api: app({ environment: { [key]: '1' } }) } }),
    ).toEqual([
      `webApps.api.environment.${key} is set by the Framework from the Lambda listen address. Remove it and read process.env.${key} in your server.`,
    ])
  })

  it('rejects AWS_LAMBDA_NODEJS_ENTRYPOINT in the environment', () => {
    expect(
      run({
        webApps: {
          api: app({ environment: { AWS_LAMBDA_NODEJS_ENTRYPOINT: 'x.js' } }),
        },
      }),
    ).toEqual([
      'webApps.api.environment.AWS_LAMBDA_NODEJS_ENTRYPOINT is set by the Framework from webApps.api.entry. Remove it and set entry instead.',
    ])
  })

  it('rejects an AWS-reserved name in the environment', () => {
    expect(
      run({ webApps: { api: app({ environment: { AWS_REGION: 'x' } }) } }),
    ).toEqual([
      'webApps.api.environment: AWS_REGION is set by AWS Lambda and cannot be overridden.',
    ])
  })

  it('accepts reserved names inherited from provider.environment', () => {
    expect(
      run({
        webApps: { api: app() },
        provider: { environment: { PORT: '8080' } },
      }),
    ).toEqual([])
  })

  it('rejects a value longer than 4096 characters', () => {
    expect(
      run({
        webApps: { api: app({ environment: { BIG: 'x'.repeat(4097) } }) },
      }),
    ).toEqual([
      'webApps.api.environment.BIG is 4097 characters; CloudFormation allows 4096 per value.',
    ])
  })

  it('accepts a value of exactly 4096 characters', () => {
    expect(
      run({
        webApps: { api: app({ environment: { BIG: 'x'.repeat(4096) } }) },
      }),
    ).toEqual([])
  })

  it('rejects an environment larger than 32768 bytes in total', () => {
    const environment = {}
    for (let i = 0; i < 9; i++) environment[`K${i}`] = 'x'.repeat(4000)
    // 9 × (2 + 4000) + the Framework's AWS_LAMBDA_NODEJS_ENTRYPOINT (51) = 36069
    expect(run({ webApps: { api: app({ environment }) } })).toEqual([
      'webApps.api.environment is 36069 bytes; Lambda allows 32768.',
    ])
  })

  it('counts provider.environment into the total and multi-byte characters as bytes', () => {
    const environment = {}
    // 4 × (2 + 4000 × 2 bytes) = 32008 bytes
    for (let i = 0; i < 4; i++) environment[`K${i}`] = 'é'.repeat(4000)
    expect(
      run({
        webApps: { api: app({ environment }) },
        provider: { environment: { SHARED: 'x'.repeat(1000) } },
      }),
    ).toEqual(['webApps.api.environment is 33065 bytes; Lambda allows 32768.'])
  })

  // 8 × (2 + 4000) = 32016 bytes, plus `R` and its value, plus
  // AWS_LAMBDA_NODEJS_ENTRYPOINT (28 bytes) and the value the Framework sets.
  const nearLimit = (rLength) => {
    const environment = { R: 'x'.repeat(rLength) }
    for (let i = 0; i < 8; i++) environment[`K${i}`] = 'x'.repeat(4000)
    return environment
  }

  it('counts the bootstrap entrypoint into the total, at the boundary', () => {
    // 32016 + 1 + 700 + 28 + 23 (__sls_web_bootstrap.mjs) = 32768
    expect(
      run({ webApps: { api: app({ environment: nearLimit(700) }) } }),
    ).toEqual([])
    expect(
      run({ webApps: { api: app({ environment: nearLimit(701) }) } }),
    ).toEqual(['webApps.api.environment is 32769 bytes; Lambda allows 32768.'])
  })

  it('counts the entry as the entrypoint of a package.artifact zip', () => {
    const artifactApp = (environment) => ({
      entry: 'a.js',
      package: { artifact: 'dist/app.zip' },
      environment,
    })
    // 32016 + 1 + 719 + 28 + 4 (a.js) = 32768
    expect(run({ webApps: { api: artifactApp(nearLimit(719)) } })).toEqual([])
    expect(run({ webApps: { api: artifactApp(nearLimit(720)) } })).toEqual([
      'webApps.api.environment is 32769 bytes; Lambda allows 32768.',
    ])
  })

  it('lets the entry override a provider value when counting', () => {
    expect(
      run({
        webApps: { api: app({ environment: { SHARED: 'small' } }) },
        provider: { environment: { SHARED: 'x'.repeat(40000) } },
      }),
    ).toEqual([])
  })

  it('skips intrinsic values in the size checks', () => {
    expect(
      run({
        webApps: {
          api: app({
            environment: {
              BIG: { 'Fn::GetAtt': ['Table', 'Arn'] },
              LIST: ['a', 'b'],
            },
          }),
        },
        provider: { environment: { HUGE: { 'Fn::Join': ['', ['x']] } } },
      }),
    ).toEqual([])
  })

  it('checks reserved names even when the value is an intrinsic', () => {
    expect(
      run({
        webApps: {
          api: app({
            environment: {
              AWS_REGION: { Ref: 'AWS::Region' },
              PORT: { Ref: 'Port' },
            },
          }),
        },
      }),
    ).toEqual([
      'webApps.api.environment: AWS_REGION is set by AWS Lambda and cannot be overridden.',
      'webApps.api.environment.PORT is set by the Framework from the Lambda listen address. Remove it and read process.env.PORT in your server.',
    ])
  })

  it('rejects an inherited provider.timeout outside 3-900 when the entry has no timeout', () => {
    expect(
      run({ webApps: { api: app() }, provider: { timeout: 1000 } }),
    ).toEqual([
      'webApps.api inherits provider.timeout (1000 seconds), and web functions accept 3–900. Set webApps.api.timeout.',
    ])
    expect(run({ webApps: { api: app() }, provider: { timeout: 2 } })).toEqual([
      'webApps.api inherits provider.timeout (2 seconds), and web functions accept 3–900. Set webApps.api.timeout.',
    ])
  })

  it('accepts an out-of-range provider.timeout when the entry sets its own timeout', () => {
    expect(
      run({
        webApps: { api: app({ timeout: 30 }) },
        provider: { timeout: 1000 },
      }),
    ).toEqual([])
  })

  it('accepts an inherited intrinsic provider.timeout', () => {
    expect(
      run({
        webApps: { api: app() },
        provider: { timeout: { Ref: 'RequestTimeout' } },
      }),
    ).toEqual([])
  })

  it('accepts an inherited provider.timeout inside 3-900', () => {
    expect(run({ webApps: { api: app() }, provider: { timeout: 6 } })).toEqual(
      [],
    )
  })

  it('hints when entry looks like file.export and no such file exists', () => {
    expect(run({ webApps: { api: { entry: 'src/server.handler' } } })).toEqual([
      'webApps.api.entry "src/server.handler" looks like a function handler (file.export). A web app starts from a file: set entry to the file that starts your HTTP server, for example src/server.js.',
    ])
  })

  it('does not hint for a missing file with a JS or TS extension', () => {
    expect(run({ webApps: { api: { entry: 'src/missing.js' } } })).toEqual([])
  })

  it('does not hint when the file.export-shaped entry exists', () => {
    fs.writeFileSync(path.join(serviceDir, 'src', 'server.main'), '')
    expect(run({ webApps: { api: { entry: 'src/server.main' } } })).toEqual([])
  })

  it('does not hint for an entry inside a package.artifact zip', () => {
    expect(
      run({
        webApps: {
          api: {
            entry: 'server.handler',
            package: { artifact: 'dist/app.zip' },
          },
        },
      }),
    ).toEqual([])
  })

  it('reports every problem across web apps', () => {
    expect(
      run({
        webApps: {
          api: app({ environment: { PORT: '1' } }),
          admin: { entry: 'src/admin.handler' },
        },
        functions: { api: { handler: 'h.main' } },
      }),
    ).toEqual([
      'webApps.api and functions.api use the same name, so both would be deployed as the Lambda function "shop-dev-api". Rename one of them.',
      'webApps.api.environment.PORT is set by the Framework from the Lambda listen address. Remove it and read process.env.PORT in your server.',
      'webApps.admin.entry "src/admin.handler" looks like a function handler (file.export). A web app starts from a file: set entry to the file that starts your HTTP server, for example src/server.js.',
    ])
  })

  // The schema rejects these too, but with configValidationMode: warn (the
  // default) a schema error is only a warning, so the validator checks
  // literal values in every validation mode.
  describe('url and runtime', () => {
    it('rejects url: false', () => {
      expect(run({ webApps: { api: app({ url: false }) } })).toEqual([
        'webApps.api.url cannot be false: every web app has an endpoint, and requests reach it only over HTTP. Remove url, or set url.authorizer: aws_iam to require signed requests.',
      ])
    })

    it.each([
      'nodejs22.x',
      'nodejs20.x',
      'NODEJS24.X',
      'python3.13',
      'node24',
      'nodejs24',
      'nodejs2.x',
      24,
      { Ref: 'Runtime' },
    ])('rejects runtime %p', (runtime) => {
      expect(run({ webApps: { api: app({ runtime }) } })).toEqual([
        'webApps.api.runtime must be nodejs24.x or newer (nodejsNN.x).',
      ])
    })

    // The schema pattern (warn mode) and the always-on check must agree
    it('accepts exactly the majors from MIN_NODE_MAJOR_VERSION up, in the schema pattern and the check alike', () => {
      const pattern = new RegExp(RUNTIME_PATTERN)
      for (let major = 1; major <= 200; major += 1) {
        const runtime = `nodejs${major}.x`
        const expected = major >= MIN_NODE_MAJOR_VERSION
        expect([runtime, pattern.test(runtime)]).toEqual([runtime, expected])
        expect([
          runtime,
          run({ webApps: { api: app({ runtime }) } }).length === 0,
        ]).toEqual([runtime, expected])
      }
      expect(RUNTIME_RULE).toBe(
        `nodejs${MIN_NODE_MAJOR_VERSION}.x or newer (nodejsNN.x)`,
      )
    })

    it('accepts url: true, url settings, no url, Node.js 24 and newer, and no runtime', () => {
      expect(
        run({
          webApps: {
            api: app({ url: true, runtime: 'nodejs24.x' }),
            admin: app({ url: { authorizer: 'aws_iam' } }),
            web: app(),
            next: app({ runtime: 'nodejs26.x' }),
            later: app({ runtime: 'nodejs30.x' }),
            far: app({ runtime: 'nodejs100.x' }),
          },
        }),
      ).toEqual([])
    })

    it('skips an intrinsic url', () => {
      expect(
        run({
          webApps: {
            api: app({
              url: { 'Fn::If': ['Cond', true, { authorizer: 'aws_iam' }] },
            }),
          },
        }),
      ).toEqual([])
    })
  })

  // The schema's case-insensitive enums use the `regexp` keyword, which the
  // config-schema handler does not apply today, so the validator checks
  // literal values as a backstop.
  describe('enum values', () => {
    it('rejects an unknown logs.applicationLogLevel', () => {
      expect(
        run({
          webApps: { api: app({ logs: { applicationLogLevel: 'VERBOSE' } }) },
        }),
      ).toEqual([
        'webApps.api.logs.applicationLogLevel must be one of: trace, debug, info, warn, error, fatal.',
      ])
    })

    it('rejects an unknown logs.systemLogLevel', () => {
      expect(
        run({ webApps: { api: app({ logs: { systemLogLevel: 'TRACE' } }) } }),
      ).toEqual([
        'webApps.api.logs.systemLogLevel must be one of: debug, info, warn.',
      ])
    })

    it('rejects an unknown url.authorizer', () => {
      expect(
        run({ webApps: { api: app({ url: { authorizer: 'none' } }) } }),
      ).toEqual(['webApps.api.url.authorizer must be one of: aws_iam.'])
    })

    it('accepts the allowed values in any case', () => {
      expect(
        run({
          webApps: {
            api: app({
              logs: { applicationLogLevel: 'Debug', systemLogLevel: 'warn' },
              url: { authorizer: 'AWS_IAM' },
            }),
            admin: app({
              logs: { applicationLogLevel: 'fatal', systemLogLevel: 'INFO' },
              url: { authorizer: 'aws_iam' },
            }),
          },
        }),
      ).toEqual([])
    })

    it('rejects non-string values, which would otherwise reach packaging', () => {
      expect(
        run({
          webApps: {
            api: app({
              logs: { applicationLogLevel: { Ref: 'Level' } },
              url: true,
            }),
            admin: app({ url: { authorizer: true } }),
          },
        }),
      ).toEqual([
        'webApps.api.logs.applicationLogLevel must be one of: trace, debug, info, warn, error, fatal.',
        'webApps.admin.url.authorizer must be one of: aws_iam.',
      ])
    })
  })

  // With configValidationMode: warn (the default) or off, a value of the wrong
  // type reaches packaging, and would throw a raw error there or compile a
  // template that can never deploy.
  describe('value types', () => {
    it.each([
      ['a string', 's3://my-static-site'],
      ['null', null],
      ['a list', [{ entry: 'src/server.ts' }]],
      ['a number', 5],
    ])('rejects a web app that is %s', (_title, webApp) => {
      expect(run({ webApps: { frontend: webApp } })).toEqual([
        'webApps.frontend must be an object with an entry file path.',
      ])
    })

    it.each([
      ['missing', { bucket: 'my-static-site' }],
      ['a number', { entry: 5 }],
      ['empty', { entry: '' }],
      ['an object', { entry: { file: 'src/server.ts' } }],
    ])('rejects an entry that is %s', (_title, webApp) => {
      expect(run({ webApps: { frontend: webApp } })).toEqual([
        'webApps.frontend.entry must be a file path, for example src/server.js.',
      ])
    })

    it.each([
      ['a list', [{ entry: 'src/server.ts' }]],
      ['a string', 'api'],
    ])('rejects webApps that is %s', (_title, webApps) => {
      expect(run({ webApps })).toEqual([
        'webApps must be an object with one entry per web app, for example api: { entry: src/server.js }.',
      ])
    })

    it.each([
      [
        { url: 'public' },
        'webApps.api.url must be true or an object of endpoint settings.',
      ],
      [
        { environment: 'FOO=bar' },
        'webApps.api.environment must be an object of variable names and values.',
      ],
      [
        { environment: ['FOO=bar'] },
        'webApps.api.environment must be an object of variable names and values.',
      ],
      [
        { vpc: 'vpc-123' },
        'webApps.api.vpc must be an object with securityGroupIds and subnetIds.',
      ],
      [
        { package: 'src/**' },
        'webApps.api.package must be an object with patterns or artifact.',
      ],
      [
        { package: { patterns: 'src/**' } },
        'webApps.api.package.patterns must be a list of glob patterns.',
      ],
      [
        { package: { patterns: ['src/**', 5] } },
        'webApps.api.package.patterns must be a list of glob patterns.',
      ],
      [
        { package: { artifact: 5 } },
        'webApps.api.package.artifact must be the path of a zip file.',
      ],
      [
        { build: true },
        'webApps.api.build must be false or the name of a build tool, for example esbuild.',
      ],
      [
        // true as the schema coerces it in warn mode
        { build: 'true' },
        'webApps.api.build must be false or the name of a build tool, for example esbuild.',
      ],
      [
        { build: { esbuild: { minify: true } } },
        'webApps.api.build must be false or the name of a build tool, for example esbuild.',
      ],
      [
        { logs: 'info' },
        'webApps.api.logs must be an object, for example applicationLogLevel: info.',
      ],
      [
        { logs: { systemLogLevel: 5 } },
        'webApps.api.logs.systemLogLevel must be one of: debug, info, warn.',
      ],
      [
        { tags: ['team'] },
        'webApps.api.tags must be an object of tag names and values.',
      ],
      [
        { role: 5 },
        'webApps.api.role must be a role name, a role ARN or a CloudFormation intrinsic.',
      ],
      [
        { role: ['MyRole'] },
        'webApps.api.role must be a role name, a role ARN or a CloudFormation intrinsic.',
      ],
      [
        { name: { a: 'b' } },
        'webApps.api.name must be letters, digits, - and _, up to 64 characters.',
      ],
      [
        { name: 'my.app' },
        'webApps.api.name must be letters, digits, - and _, up to 64 characters.',
      ],
      [
        { timeout: 'soon' },
        'webApps.api.timeout must be a whole number of seconds from 3 to 900.',
      ],
      [
        { timeout: 901 },
        'webApps.api.timeout must be a whole number of seconds from 3 to 900.',
      ],
      [
        { maxConcurrency: 0 },
        'webApps.api.maxConcurrency must be a whole number from 1 to 128.',
      ],
      [
        { maxConcurrency: true },
        'webApps.api.maxConcurrency must be a whole number from 1 to 128.',
      ],
      [
        { url: { maxEnvironments: 1 } },
        'webApps.api.url.maxEnvironments must be a whole number from 2 to 10000.',
      ],
      [
        { url: { maxEnvironments: 10001 } },
        'webApps.api.url.maxEnvironments must be a whole number from 2 to 10000.',
      ],
      [
        { url: { maxEnvironments: 'many' } },
        'webApps.api.url.maxEnvironments must be a whole number from 2 to 10000.',
      ],
      [
        { url: { rateLimit: 150 } },
        'webApps.api.url.rateLimit must be 0, 100 to 1000 in steps of 100, or 2000 to 10000 in steps of 1000.',
      ],
      [
        { url: { rateLimit: 'fast' } },
        'webApps.api.url.rateLimit must be 0, 100 to 1000 in steps of 100, or 2000 to 10000 in steps of 1000.',
      ],
    ])('rejects %p', (extra, message) => {
      expect(run({ webApps: { api: app(extra) } })).toEqual([message])
    })

    it('accepts every value type the schema allows, intrinsics included', () => {
      expect(
        run({
          webApps: {
            api: app({
              name: 'shop-api_1',
              timeout: 30,
              maxConcurrency: '64',
              environment: { A: 'b', B: { Ref: 'Param' } },
              vpc: { securityGroupIds: ['sg-1'], subnetIds: ['subnet-1'] },
              package: { patterns: ['src/**'], artifact: undefined },
              build: 'esbuild',
              logs: { applicationLogLevel: 'info' },
              tags: { team: 'web', cost: { Ref: 'CostCenter' } },
              role: { 'Fn::GetAtt': ['MyRole', 'Arn'] },
              url: { authorizer: 'aws_iam', maxEnvironments: 5 },
            }),
            // configValidationMode: off leaves numeric strings as written
            strings: app({ url: { maxEnvironments: '50', rateLimit: '0' } }),
            intrinsics: app({
              url: {
                maxEnvironments: { Ref: 'MaxEnvironments' },
                rateLimit: { Ref: 'RateLimit' },
              },
            }),
            admin: app({ build: false, role: 'MyRole', url: true }),
            prebuilt: {
              entry: 'server.js',
              package: { artifact: 'site.zip' },
            },
          },
        }),
      ).toEqual([])
    })
  })

  describe('IAM settings', () => {
    it('points to iam.inheritStatements when provider statements would be dropped', () => {
      expect(
        run({
          webApps: { api: app({ iamRoleStatements: [] }) },
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
        }),
      ).toEqual([
        'webApps.api.iamRoleStatements is not supported on web apps. Use webApps.api.iam.role.statements, and add webApps.api.iam.inheritStatements: true to keep provider.iam.role.statements.',
      ])
    })

    // The schema rejects the older keys too, but with configValidationMode:
    // warn (the default) or off the role code would still apply them.
    it.each([
      ['iamRoleStatements', [], 'iam.role.statements'],
      ['iamRoleStatementsInherit', true, 'iam.inheritStatements'],
      ['iamRoleStatementsName', 'api-role', 'iam.role.name'],
      [
        'iamPermissionsBoundary',
        'arn:aws:iam::123456789012:policy/boundary',
        'iam.role.permissionsBoundary',
      ],
    ])('rejects %s and names its replacement', (key, value, replacement) => {
      expect(run({ webApps: { api: app({ [key]: value }) } })).toEqual([
        `webApps.api.${key} is not supported on web apps. Use webApps.api.${replacement}.`,
      ])
    })

    it.each([
      [
        'iam',
        'arn:aws:iam::123456789012:role/web',
        'webApps.api.iam must be an object, for example role: { statements: [...] }.',
      ],
      [
        'iam.role',
        { role: 'arn:aws:iam::123456789012:role/web' },
        'webApps.api.iam.role must be an object of role settings, for example statements. To use an existing role, set webApps.api.role.',
      ],
      [
        'iam.role.statements',
        { role: { statements: { Effect: 'Allow' } } },
        'webApps.api.iam.role.statements must be a list of IAM policy statements.',
      ],
      [
        'iam.role.managedPolicies',
        { role: { managedPolicies: 'arn:aws:iam::aws:policy/ReadOnlyAccess' } },
        'webApps.api.iam.role.managedPolicies must be a list of managed policy ARNs.',
      ],
    ])('rejects %s of the wrong type', (_field, iam, message) => {
      expect(run({ webApps: { api: app({ iam }) } })).toEqual([message])
    })

    it('accepts the per-web-app IAM keys', () => {
      expect(
        run({
          webApps: {
            api: app({
              iam: {
                inheritStatements: false,
                role: {
                  name: 'shop-dev-api-role',
                  statements: [
                    {
                      Effect: 'Allow',
                      Action: ['s3:GetObject'],
                      Resource: '*',
                    },
                  ],
                  managedPolicies: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
                  permissionsBoundary: 'arn:aws:iam::1:policy/boundary',
                  path: '/web/',
                  tags: { team: 'web' },
                },
              },
            }),
          },
        }),
      ).toEqual([])
    })

    it('rejects iam while the serverless-iam-roles-per-function plugin is loaded', () => {
      expect(
        validateWebApps({
          webApps: {
            api: app({ iam: { role: { statements: [] } } }),
            admin: app(),
          },
          serviceName: 'shop',
          stage: 'dev',
          serviceDir,
          iamRolesPerFunctionPluginLoaded: true,
        }),
      ).toEqual([
        'webApps.api.iam is not applied while the serverless-iam-roles-per-function plugin is loaded. Remove the plugin from plugins: the Framework gives functions and web apps roles of their own without it.',
      ])
    })
  })
})
