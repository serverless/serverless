import { spawn } from 'child_process'
import { readdir, readFile } from 'fs/promises'
import http from 'http'
import path from 'path'
import url from 'url'
import {
  CLEANUP_MIN_AGE_MS,
  SAM_STACK_PREFIXES,
  isTestStack,
  stackIdFromStateKey,
  staleStacks,
  staleStateKeys,
  stateStackStatuses,
} from '../../scripts/test-account-cleanup/rules.js'

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

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        response.writeHead(403, { 'Content-Type': 'text/xml' })
        response.end(
          `<ErrorResponse><Error><Type>Sender</Type><Code>AccessDenied</Code><Message>User: arn:aws:sts::${ACCOUNT_ID}:assumed-role/role/session is not authorized to perform: cloudformation:ListStacks</Message></Error><RequestId>1</RequestId></ErrorResponse>`,
        )
      })
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    endpoint = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  test('fail the run without printing the error message', async () => {
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
    expect(code).toBe(1)
    expect(output).toMatch(/AccessDenied/)
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
