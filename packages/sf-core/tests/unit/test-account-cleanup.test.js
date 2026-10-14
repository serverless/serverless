import { spawn } from 'child_process'
import { readdir, readFile } from 'fs/promises'
import http from 'http'
import path from 'path'
import url from 'url'
import {
  CLEANUP_MIN_AGE_MS,
  DEV_MODE_PREFIX,
  SAM_STACK_PREFIXES,
  isAccessDenied,
  isDeploymentBucket,
  isDevModeTestBrokerRole,
  isDevModeTestLayer,
  isTestStack,
  stackIdFromStateKey,
  staleDevModeLayers,
  staleDevModeObjects,
  staleDevModeRoles,
  staleStacks,
  staleStateKeys,
  stateStackStatuses,
} from '../../scripts/test-account-cleanup/rules.js'
import {
  brokerRoleName,
  layerName,
} from '../../../serverless/lib/plugins/aws/dev/attach/naming.js'
import { newDevModeTestSuffix } from '../utils/devModeTestSuffix.js'

// The cleanup job deletes leftovers of integration-test runs from the shared
// test accounts. These tests keep its matching rules in step with the suites:
// every stack a suite deploys in CI must match, and nothing else may.
const rootDir = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../..',
)
const integrationDir = path.join(rootDir, 'tests/integration')

const NOW = new Date('2026-10-02T12:00:00Z')
const OLD = new Date(NOW.getTime() - CLEANUP_MIN_AGE_MS - 60_000)
const RECENT = new Date(NOW.getTime() - CLEANUP_MIN_AGE_MS + 60_000)

// Stages as CI builds them: today's `<5-char prefix>t<run id>` and the older
// `<10-char prefix>t<4 digits>`, plus the extra characters some suites add to
// derive a second stage.
const CI_STAGES = [
  'pr-czttm8lpvg57',
  'mr-czttm8lpvg57',
  'pr-dettm8lpvg57',
  'pr-czubocht1234',
  'pr-dependat1234',
  'mr-czubocht1234',
  'ppr-czttm8lpvg57',
  'pr-czttm8lpvg57s',
  'pr-czttm8lpvg57p',
  'pr-czttm8lpvg57x',
  'pr-czttm8lpvg57fr',
  'pr-at1234',
  'pr-czubocht1234fr',
]

const filesUnder = async (dir, pattern) =>
  (await readdir(dir, { recursive: true }))
    .filter((entry) => pattern.test(entry) && !entry.includes('node_modules'))
    .map((entry) => path.join(dir, entry))

const fixtureServices = async () => {
  const services = new Set()
  for (const file of await filesUnder(integrationDir, /\.ya?ml$/)) {
    const match = (await readFile(file, 'utf8')).match(
      /^service:\s*([A-Za-z0-9-]+)\s*$/m,
    )
    if (match) services.add(match[1])
  }
  return [...services]
}

// Stack names the SAM suites set: `stackName`/`StackName` in the tests and
// fixtures, `stack_name` in samconfig.toml.
const samStackPrefixes = async () => {
  const prefixes = new Set()
  const samDir = path.join(integrationDir, 'sam')
  for (const file of await filesUnder(samDir, /\.(js|toml|ya?ml)$/)) {
    const text = await readFile(file, 'utf8')
    for (const [, prefix] of text.matchAll(
      /(?:stackName|StackName|stack_name)\s*[:=]\s*[`'"]?([a-z][a-z0-9-]+)-\$\{(?:randomId|env:STACK_RANDOM_ID)\}/g,
    )) {
      prefixes.add(prefix)
    }
  }
  return [...prefixes]
}

describe('test stack matching', () => {
  test('matches every fixture service deployed at a CI stage', async () => {
    const services = await fixtureServices()
    expect(services.length).toBeGreaterThan(30)
    const missed = services.flatMap((service) =>
      CI_STAGES.map((stage) => `${service}-${stage}`).filter(
        (name) => !isTestStack(name),
      ),
    )
    expect(missed).toEqual([])
  })

  test('lists every stack-name prefix the SAM suites use', async () => {
    const prefixes = await samStackPrefixes()
    expect(prefixes.length).toBeGreaterThan(5)
    expect(
      prefixes.filter((prefix) => !SAM_STACK_PREFIXES.includes(prefix)),
    ).toEqual([])
  })

  test.each(SAM_STACK_PREFIXES)(
    'matches %s stacks with an old or current run id',
    (prefix) => {
      expect(isTestStack(`${prefix}-1234`)).toBe(true)
      expect(isTestStack(`${prefix}-tm8lpvg57`)).toBe(true)
    },
  )

  test.each([
    // Prerequisites documented in TESTING.md.
    'sfc-nodejs-resolvers-integration-test',
    'mcp-integration-test-cognito',
    // Stacks deployed by hand or at a fixed stage.
    'my-service-dev',
    'my-service-prod',
    'sfc-dashboard-dev',
    'sam-integration-tests-framework',
    'compose-a-1234',
    'sam-todo-integration-test',
    'sam-todo-integration-test-dev',
    'some-team-tool-preview',
    'docs-site-pr-preview',
    'docs-site-pr-123',
    'compose-a-maxtest-y85f',
    'repro-pr-',
    // Names with `-pr-` or `-mr-` that no CI stage produces.
    'backend-pr-integration-test',
    'app-pr-123-prod',
    'site-pr-feature-main',
    'foo-mr-bar-dev1',
    'app-pr-latest-v1a2',
    'compose-a-mr--tpui',
    'compose-a-pr-octocat-yixs',
    'compose-a-pr-czubochat1234',
    'compose-a-pr-czutm8lpvg57',
    'compose-a-pr-czttm8lpvg57y',
  ])('never matches %s', (name) => {
    expect(isTestStack(name)).toBe(false)
  })
})

describe('staleStacks', () => {
  const stack = (StackName, overrides = {}) => ({
    StackName,
    StackStatus: 'CREATE_COMPLETE',
    CreationTime: OLD,
    ...overrides,
  })

  test('selects old test stacks and keeps everything else', () => {
    const stacks = [
      stack('compose-a-pr-czubocht1234'),
      stack('sam-todo-integration-test-1234', { StackStatus: 'DELETE_FAILED' }),
      stack('compose-a-pr-czttm8lpvg57', { CreationTime: RECENT }),
      stack('compose-a-pr-czttm8lpvg58', {
        CreationTime: OLD,
        LastUpdatedTime: RECENT,
      }),
      stack('compose-a-pr-czttm8lpvg59', {
        StackStatus: 'UPDATE_IN_PROGRESS',
      }),
      stack('compose-b-pr-czubocht1234', { StackStatus: 'UPDATE_FAILED' }),
      stack('compose-c-pr-czubocht1234', {
        StackStatus: 'IMPORT_ROLLBACK_FAILED',
      }),
      stack('my-service-dev'),
    ]
    expect(staleStacks(stacks, NOW).map(({ StackName }) => StackName)).toEqual([
      'compose-a-pr-czubocht1234',
      'sam-todo-integration-test-1234',
      'compose-b-pr-czubocht1234',
      'compose-c-pr-czubocht1234',
    ])
  })
})

describe('staleStateKeys', () => {
  const stackId = (name, region = 'us-east-1') =>
    `arn:aws:cloudformation:${region}:123456789012:stack/${name}/0d3a1c2e-1b2c-4d5e-8f90-123456789abc`
  const key = (name, type = 'traditional', region = 'us-east-1') =>
    `services/${type}/${stackId(name, region)
      .replace('stack/', 'stack_')
      .replace(/\/(?=[0-9a-f-]{36}$)/, '_')}/state/state.json`

  test('reads the stack id back from a state key', () => {
    expect(stackIdFromStateKey(key('compose-a-pr-czubocht1234'))).toBe(
      stackId('compose-a-pr-czubocht1234'),
    )
    expect(stackIdFromStateKey(key('cfn-integration-test-1234', 'cfn'))).toBe(
      stackId('cfn-integration-test-1234'),
    )
    expect(stackIdFromStateKey('services/traditional/other.json')).toBe(
      undefined,
    )
  })

  test('selects old keys of test stacks that no longer exist', () => {
    const objects = [
      { Key: key('compose-a-pr-czubocht1234'), LastModified: OLD },
      { Key: key('compose-b-pr-czubocht1234'), LastModified: OLD },
      { Key: key('compose-c-pr-czubocht1234'), LastModified: RECENT },
      { Key: key('my-service-dev'), LastModified: OLD },
      { Key: 'services/traditional/other.json', LastModified: OLD },
    ]
    const statusById = new Map([
      [stackId('compose-a-pr-czubocht1234'), 'DELETE_COMPLETE'],
      [stackId('compose-b-pr-czubocht1234'), 'UPDATE_COMPLETE'],
      [stackId('compose-c-pr-czubocht1234'), undefined],
      [stackId('my-service-dev'), undefined],
    ])
    expect(staleStateKeys(objects, statusById, NOW)).toEqual([
      key('compose-a-pr-czubocht1234'),
    ])
  })

  test('treats a stack CloudFormation no longer knows as gone', () => {
    const objects = [
      { Key: key('compose-a-pr-czubocht1234'), LastModified: OLD },
    ]
    expect(
      staleStateKeys(
        objects,
        new Map([[stackId('compose-a-pr-czubocht1234'), null]]),
        NOW,
      ),
    ).toEqual([key('compose-a-pr-czubocht1234')])
  })

  test('keeps old keys of test stacks whose status is unknown', () => {
    const objects = [
      { Key: key('compose-a-pr-czubocht1234'), LastModified: OLD },
    ]
    expect(staleStateKeys(objects, new Map(), NOW)).toEqual([])
  })

  // One state bucket holds the keys of stacks in every region.
  test('looks each stack up in its own region', () => {
    const live = key('compose-a-pr-czubocht1234', 'traditional', 'us-east-2')
    const gone = key('compose-b-pr-czubocht1234', 'traditional', 'us-east-2')
    const unlisted = key(
      'compose-c-pr-czubocht1234',
      'traditional',
      'eu-central-1',
    )
    const objects = [live, gone, unlisted].map((Key) => ({
      Key,
      LastModified: OLD,
    }))
    const stacksByRegion = new Map([
      ['us-east-1', []],
      [
        'us-east-2',
        [
          {
            StackId: stackId('compose-a-pr-czubocht1234', 'us-east-2'),
            StackStatus: 'UPDATE_COMPLETE',
          },
        ],
      ],
    ])
    const statusById = stateStackStatuses(objects, stacksByRegion)
    expect(
      statusById.get(stackId('compose-a-pr-czubocht1234', 'us-east-2')),
    ).toBe('UPDATE_COMPLETE')
    expect(
      statusById.get(stackId('compose-b-pr-czubocht1234', 'us-east-2')),
    ).toBe(null)
    expect(
      statusById.has(stackId('compose-c-pr-czubocht1234', 'eu-central-1')),
    ).toBe(false)
    expect(staleStateKeys(objects, statusById, NOW)).toEqual([gone])
  })
})

// The report runs in public CI logs, and AWS error messages can name the
// account (in role ARNs) or a bucket.
describe('report errors', () => {
  const ACCOUNT_ID = '123456789012'
  let server
  let endpoint
  // How the fake AWS endpoint answers each request: `(request, body, response)`.
  let respond

  const xmlError = (response, status, code) => {
    response.writeHead(status, { 'Content-Type': 'text/xml' })
    response.end(
      `<ErrorResponse><Error><Type>Sender</Type><Code>${code}</Code><Message>User: arn:aws:sts::${ACCOUNT_ID}:assumed-role/role/session is not authorized</Message></Error><RequestId>1</RequestId></ErrorResponse>`,
    )
  }
  const denyAll = (request, body, response) =>
    xmlError(response, 403, 'AccessDenied')
  // CloudFormation lists no stacks and the account has no state bucket; every other call goes
  // to `other`.
  const emptyAccount = (other) => (request, body, response) => {
    if (body.includes('Action=ListStacks')) {
      response.writeHead(200, { 'Content-Type': 'text/xml' })
      response.end(
        '<ListStacksResponse xmlns="http://cloudformation.amazonaws.com/doc/2010-05-15/"><ListStacksResult><StackSummaries/></ListStacksResult><ResponseMetadata><RequestId>1</RequestId></ResponseMetadata></ListStacksResponse>',
      )
      return
    }
    if (request.headers['x-amz-target'] === 'AmazonSSM.GetParameter') {
      response.writeHead(400, {
        'Content-Type': 'application/x-amz-json-1.1',
      })
      response.end(
        JSON.stringify({ __type: 'ParameterNotFound', message: 'none' }),
      )
      return
    }
    other(request, body, response)
  }

  const runReport = async () => {
    const child = spawn(
      process.execPath,
      ['scripts/test-account-cleanup/report.js', '--regions', 'us-east-1'],
      {
        cwd: rootDir,
        env: {
          PATH: process.env.PATH,
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test',
          AWS_REGION: 'us-east-1',
          AWS_ENDPOINT_URL: endpoint,
          AWS_CONFIG_FILE: path.join(rootDir, 'missing-aws-config'),
          AWS_SHARED_CREDENTIALS_FILE: path.join(rootDir, 'missing-aws-creds'),
        },
      },
    )
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const code = await new Promise((resolve) => child.on('close', resolve))
    return { code, output }
  }

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk) => (body += chunk))
      request.on('end', () => respond(request, body, response))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  test('fail the run without printing the error message', async () => {
    respond = denyAll
    const { code, output } = await runReport()
    expect(code).toBe(1)
    expect(output).toMatch(/AccessDenied/)
    expect(output).not.toContain(ACCOUNT_ID)
  }, 30_000)

  test('a Dev Mode listing the role may not make is a warning in its section, not a failure', async () => {
    respond = emptyAccount(denyAll)
    const { code, output } = await runReport()
    expect(code).toBe(0)
    const section = output.slice(output.indexOf('### Dev Mode test leftovers'))
    expect(section).toMatch(
      /- Warning: could not list IAM roles \(iam:ListRoles\) \(AccessDenied\): not checked/,
    )
    expect(section).toMatch(
      /- Warning: could not list S3 buckets \(s3:ListAllMyBuckets\)/,
    )
    expect(section).toMatch(
      /- Warning: could not list Lambda layers in us-east-1 \(lambda:ListLayers\)/,
    )
    // Nothing was listed, so nothing is counted.
    expect(section).not.toMatch(/would be deleted/)
    expect(output).not.toContain(ACCOUNT_ID)
  }, 30_000)

  test('any other error in a Dev Mode listing still fails the run', async () => {
    respond = emptyAccount((request, body, response) =>
      xmlError(response, 400, 'ValidationError'),
    )
    const { code, output } = await runReport()
    expect(code).toBe(1)
    expect(output).toContain(
      'Cleanup report failed while listing IAM roles: ValidationError',
    )
    expect(output).not.toContain(ACCOUNT_ID)
  }, 30_000)
})

// The first version only reports. Deleting is a separate, reviewed change, so
// until then neither the script nor its workflow may call a delete API.
describe('dry run', () => {
  test('the report script uses no delete operation', async () => {
    const source = await readFile(
      path.join(rootDir, 'scripts/test-account-cleanup/report.js'),
      'utf8',
    )
    expect(source).not.toMatch(
      /Delete[A-Za-z]*Command|deleteStack|deleteObject/i,
    )
  })

  test('the workflow runs the report on every test account, on the main repository only', async () => {
    const yaml = (await import('js-yaml')).default
    const workflow = yaml.load(
      await readFile(
        path.join(rootDir, '../../.github/workflows/cleanup-test-accounts.yml'),
        'utf8',
      ),
    )
    const job = workflow.jobs.report
    const credentials = job.steps.find(({ uses }) =>
      uses?.startsWith('aws-actions/configure-aws-credentials@'),
    )
    expect(credentials.with['mask-aws-account-id']).toBe(true)
    expect(job.if).toBe("${{ github.repository == 'serverless/serverless' }}")
    expect(job.strategy.matrix.include.map(({ role }) => role)).toEqual([
      '${{ vars.TEST1_ROLE_ARN }}',
      '${{ vars.TEST2_ROLE_ARN }}',
      '${{ vars.TEST3_ROLE_ARN }}',
    ])
    expect(workflow.permissions).toEqual({
      'id-token': 'write',
      contents: 'read',
    })
    const text = JSON.stringify(workflow)
    expect(text).toMatch(/test-account-cleanup\/report\.js/)
    expect(text).not.toMatch(/delete/i)
  })
})

// Live Dev Mode tests create a broker role and layers named with a test suffix. The rules must
// match exactly the names those tests produce, and never the shared, unsuffixed ones that real
// use of Dev Mode in the account creates.
describe('Dev Mode test leftovers', () => {
  test('match the suffixed names live tests create and never the shared ones', () => {
    const env = { SLS_DEV_TEST_SUFFIX: newDevModeTestSuffix() }
    for (const region of [
      'us-east-1',
      'eu-central-1',
      'ap-southeast-2',
      'us-gov-west-1',
    ]) {
      expect(isDevModeTestBrokerRole(brokerRoleName(region, env))).toBe(true)
      expect(isDevModeTestBrokerRole(brokerRoleName(region, {}))).toBe(false)
    }
    for (const arch of ['x86_64', 'arm64']) {
      expect(isDevModeTestLayer(layerName(arch, env))).toBe(true)
      expect(isDevModeTestLayer(layerName(arch, {}))).toBe(false)
    }
    expect(
      isDevModeTestBrokerRole('serverless-dev-broker-us-east-1-p4a1b2c3'),
    ).toBe(true)
    // An older Dev Mode's layer, and names that only look alike.
    expect(isDevModeTestLayer('serverless-dev-mode')).toBe(false)
    expect(isDevModeTestBrokerRole('serverless-dev-broker-us-east-1-')).toBe(
      false,
    )
    expect(
      isDevModeTestBrokerRole('serverless-dev-broker-us-east-1-Upper'),
    ).toBe(false)
    expect(
      isDevModeTestBrokerRole('serverless-dev-broker-us-east-1-abcdefghijklm'),
    ).toBe(false)
    expect(
      isDevModeTestBrokerRole('team-serverless-dev-broker-us-east-1-it1'),
    ).toBe(false)
  })

  test('select old suffixed roles and layers and keep recent and shared ones', () => {
    const roles = [
      { RoleName: 'serverless-dev-broker-us-east-1-itold', CreateDate: OLD },
      { RoleName: 'serverless-dev-broker-us-east-1-itnew', CreateDate: RECENT },
      { RoleName: 'serverless-dev-broker-us-east-1', CreateDate: OLD },
    ]
    expect(
      staleDevModeRoles(roles, NOW).map(({ RoleName }) => RoleName),
    ).toEqual(['serverless-dev-broker-us-east-1-itold'])
    const layers = [
      {
        LayerName: 'serverless-dev-arm64-itold',
        LatestMatchingVersion: { CreatedDate: OLD.toISOString() },
      },
      {
        LayerName: 'serverless-dev-x86_64-itnew',
        LatestMatchingVersion: { CreatedDate: RECENT.toISOString() },
      },
      {
        LayerName: 'serverless-dev-arm64',
        LatestMatchingVersion: { CreatedDate: OLD.toISOString() },
      },
      {
        LayerName: 'serverless-dev-mode',
        LatestMatchingVersion: { CreatedDate: OLD.toISOString() },
      },
    ]
    expect(
      staleDevModeLayers(layers, NOW).map(({ LayerName }) => LayerName),
    ).toEqual(['serverless-dev-arm64-itold'])
  })

  test('count old objects under the Dev Mode prefix and name only test stages', () => {
    // The prefix separates service and stage with `/`; the test stack name joins them with `-`.
    const entries = [
      {
        Key: `${DEV_MODE_PREFIX}devmode-agent/pr-czttm8lpvg57/s_1/a`,
        LastModified: OLD,
      },
      {
        Key: `${DEV_MODE_PREFIX}devmode-agent/pr-czttm8lpvg57/s_1/b`,
        LastModified: OLD,
      },
      { Key: `${DEV_MODE_PREFIX}orders/dev/s_2/c`, LastModified: OLD },
      { Key: `${DEV_MODE_PREFIX}orders/dev/s_3/d`, LastModified: RECENT },
    ]
    expect(staleDevModeObjects(entries, NOW)).toEqual({
      count: 3,
      testStages: ['devmode-agent-pr-czttm8lpvg57'],
    })
  })

  test('a refused listing is told apart from other errors', () => {
    expect(isAccessDenied({ name: 'AccessDenied' })).toBe(true)
    expect(isAccessDenied({ name: 'AccessDeniedException' })).toBe(true)
    expect(
      isAccessDenied({ name: 'Other', $metadata: { httpStatusCode: 403 } }),
    ).toBe(true)
    expect(isAccessDenied({ name: 'ThrottlingException' })).toBe(false)
    expect(isAccessDenied(undefined)).toBe(false)
  })

  test('recognise only the deployment buckets of the region', () => {
    expect(
      isDeploymentBucket(
        'serverless-framework-deployments-us-east-1-0a1b2c3d-4e5f',
        'us-east-1',
      ),
    ).toBe(true)
    expect(
      isDeploymentBucket(
        'serverless-framework-deployments-us-east-2-0a1b2c3d-4e5f',
        'us-east-1',
      ),
    ).toBe(false)
    expect(isDeploymentBucket('my-bucket', 'us-east-1')).toBe(false)
  })
})
