import * as out from '../../../../../../../lib/plugins/aws/dev/attach/output.js'
import { ENV_UNREADABLE_WHY } from '../../../../../../../lib/plugins/aws/dev/attach/undo-record.js'
import { credentialsInvalidError } from '../../../../../../../lib/plugins/aws/dev/attach/aws.js'
import { runWithoutColor } from '../without-color.js'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import {
  getColorSettingsForTests,
  setColorSettingsForTests,
  style,
} from '@serverless/util/src/logger/index.js'

// Its tests read the plain text of styled lines.
runWithoutColor()

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

const rows = [
  { function: 'createOrder', mode: 'dev', notes: [] },
  {
    function: 'syncCrm',
    mode: 'dev',
    notes: [
      {
        reason: 'vpc_egress_required',
        message: 'needs outbound access to AWS IoT Core, STS and S3 (VPC)',
      },
    ],
  },
  {
    function: 'reportJob',
    mode: 'deployed',
    reason: 'runtime_not_supported',
    why: 'Java runtime (Dev Mode support planned)',
    notes: [],
  },
  {
    function: 'billing',
    mode: 'skipped',
    reason: 'owned_by_other_session',
    why: 'in Dev Mode for bob@desk (--take-over to take it)',
    notes: [],
  },
]

test('the mode table has a Why column and only the dev, deployed and skipped words', () => {
  expect(out.renderModeTable(rows)).toBe(
    [
      'Function     Mode      Why',
      'createOrder  dev',
      'syncCrm      dev       needs outbound access to AWS IoT Core, STS and S3 (VPC)',
      'reportJob    deployed  Java runtime (Dev Mode support planned)',
      'billing      skipped   in Dev Mode for bob@desk (--take-over to take it)',
    ].join('\n'),
  )
  expect(out.renderModeTable(rows)).not.toMatch(/\blocal\b|\bcloud\b/i)
})

test('the mode table joins several notes of a dev function', () => {
  const table = out.renderModeTable([
    {
      function: 'a',
      mode: 'dev',
      notes: [
        {
          reason: 'reattached',
          message: 'left in Dev Mode by an earlier session of yours',
        },
        { reason: 'vpc_egress_required', message: 'needs outbound access' },
      ],
    },
  ])
  expect(table.split('\n')[1]).toBe(
    'a         dev   left in Dev Mode by an earlier session of yours; needs outbound access',
  )
})

test('the plan lists account setup and function changes before anything changes', () => {
  const plan = out.buildPlan({
    stage: 'alice',
    deployFirst: false,
    brokerName: 'serverless-dev-broker-us-east-1',
    brokerExists: false,
    missingLayers: ['serverless-dev-arm64'],
    devRows: [
      { function: 'createOrder', arch: 'arm64' },
      { function: 'syncCrm', arch: 'arm64' },
    ],
  })
  expect(plan.accountSetup).toEqual([
    { action: 'create_broker_role', name: 'serverless-dev-broker-us-east-1' },
    { action: 'publish_layer', name: 'serverless-dev-arm64' },
  ])
  expect(plan.changes[0]).toEqual({
    function: 'createOrder',
    action: 'attach',
    fields: [
      'Layers +serverless-dev-arm64',
      'Environment +AWS_LAMBDA_EXEC_WRAPPER, SLS_DEV_*',
    ],
  })
  expect(plan.cloudformation).toBe(false)
  expect(out.renderPlan({ plan, region: 'us-east-1' })).toBe(
    [
      'Account setup (first time in us-east-1):',
      '  • create IAM role serverless-dev-broker-us-east-1 (lets attached functions reach AWS IoT Core)',
      '  • publish Lambda layer serverless-dev-arm64',
      'These changes will be made to 2 functions (configuration only, no CloudFormation deploy):',
      '  • add the Dev Mode layer and set AWS_LAMBDA_EXEC_WRAPPER to the Dev Mode wrapper',
      '  • add Dev Mode variables (SLS_DEV_*); timeouts, code and IAM roles are not changed',
      '  Functions: createOrder, syncCrm',
      'They are restored when you exit, or by the next serverless dev, deploy, remove or dev restore.',
    ].join('\n'),
  )
})

test('a plan for an undeployed stage says it deploys first, and leaves out set-up that exists', () => {
  const plan = out.buildPlan({
    stage: 'alice',
    deployFirst: true,
    brokerName: 'serverless-dev-broker-us-east-1',
    brokerExists: true,
    missingLayers: [],
    devRows: [{ function: 'createOrder', arch: 'x86_64' }],
  })
  expect(plan.accountSetup).toEqual([])
  expect(plan.cloudformation).toBe(true)
  expect(plan.changes[0].fields[0]).toBe('Layers +serverless-dev-x86_64')
  const rendered = out.renderPlan({ plan, region: 'us-east-1' })
  expect(rendered.split('\n')[0]).toBe(
    'Stage "alice" is not deployed yet. Dev Mode deploys it first: a normal deployment of your code.',
  )
  expect(rendered).not.toMatch(/Account setup/)
  expect(rendered).toMatch(/to 1 function \(/)
})

test('the plan names a broker policy repair', () => {
  const plan = out.buildPlan({
    stage: 'dev',
    deployFirst: false,
    brokerName: 'serverless-dev-broker-us-east-1',
    brokerExists: true,
    brokerPolicy: 'missing',
    missingLayers: [],
    devRows: [],
  })
  expect(plan.accountSetup).toEqual([
    { action: 'repair_broker_policy', name: 'serverless-dev-broker-us-east-1' },
  ])
  const rendered = out.renderPlan({ plan, region: 'us-east-1' })
  expect(rendered).toContain(
    '  • put back the permission policy serverless-dev-broker of IAM role serverless-dev-broker-us-east-1 (it is missing)',
  )
  // A repair alone creates nothing, so it is not a first-time setup.
  expect(rendered.split('\n')[0]).toBe('Account setup in us-east-1:')
})

test('the plan names the update of an earlier broker policy', () => {
  const plan = out.buildPlan({
    stage: 'dev',
    deployFirst: false,
    brokerName: 'serverless-dev-broker-us-east-1',
    brokerExists: true,
    brokerPolicy: 'outdated',
    missingLayers: [],
    devRows: [],
  })
  expect(plan.accountSetup).toEqual([
    { action: 'update_broker_policy', name: 'serverless-dev-broker-us-east-1' },
  ])
  expect(out.renderPlan({ plan, region: 'us-east-1' })).toBe(
    [
      'Account setup in us-east-1:',
      '  • update the permission policy serverless-dev-broker of IAM role serverless-dev-broker-us-east-1 (it differs from the one this version of Dev Mode writes)',
    ].join('\n'),
  )
})

test('a broker whose policy is in place, or cannot be read, needs no step', () => {
  for (const brokerPolicy of ['present', 'newer', 'unknown', undefined]) {
    expect(
      out.buildPlan({
        stage: 'dev',
        deployFirst: false,
        brokerName: 'serverless-dev-broker-us-east-1',
        brokerExists: true,
        brokerPolicy,
        missingLayers: [],
        devRows: [],
      }).accountSetup,
    ).toEqual([])
  }
})

test('a broker that is created is not also repaired; a repair beside a new layer is listed with it', () => {
  const created = out.buildPlan({
    stage: 'dev',
    deployFirst: false,
    brokerName: 'serverless-dev-broker-us-east-1',
    brokerExists: false,
    brokerPolicy: 'missing',
    missingLayers: [],
    devRows: [],
  })
  expect(created.accountSetup).toEqual([
    { action: 'create_broker_role', name: 'serverless-dev-broker-us-east-1' },
  ])
  const both = out.buildPlan({
    stage: 'dev',
    deployFirst: false,
    brokerName: 'serverless-dev-broker-us-east-1',
    brokerExists: true,
    brokerPolicy: 'missing',
    missingLayers: ['serverless-dev-arm64'],
    devRows: [],
  })
  expect(out.renderPlan({ plan: both, region: 'us-east-1' })).toBe(
    [
      'Account setup (first time in us-east-1):',
      '  • put back the permission policy serverless-dev-broker of IAM role serverless-dev-broker-us-east-1 (it is missing)',
      '  • publish Lambda layer serverless-dev-arm64',
    ].join('\n'),
  )
})

test('finalRow turns attach outcomes into rows', () => {
  const row = { function: 'a', mode: 'dev', notes: [] }
  expect(out.finalRow(row, { status: 'attached' })).toBe(row)
  expect(
    out.finalRow(row, {
      status: 'rejected',
      reason: 'no_free_layer_slot',
      why: 'already uses 5 layers',
    }),
  ).toEqual({
    function: 'a',
    mode: 'deployed',
    reason: 'no_free_layer_slot',
    why: 'already uses 5 layers',
    notes: [],
  })
  expect(out.finalRow(row, { status: 'failed', message: 'boom' })).toEqual({
    function: 'a',
    mode: 'deployed',
    reason: 'attach_failed',
    why: 'attach failed: boom',
    notes: [],
  })
  expect(out.finalRow(row, { status: 'not_started' })).toMatchObject({
    mode: 'deployed',
    reason: 'not_attached',
  })
  const skipped = {
    function: 'a',
    mode: 'skipped',
    reason: 'owned_by_other_session',
    why: 'x',
    notes: [],
  }
  expect(out.finalRow(row, { status: 'skipped', row: skipped })).toBe(skipped)
})

test('a function whose variables cannot be read at attach time is deployed and says why', () => {
  const row = { function: 'a', mode: 'dev', notes: [] }
  const final = out.finalRow(row, {
    status: 'rejected',
    reason: 'env_unreadable',
    why: ENV_UNREADABLE_WHY,
  })
  expect(final).toMatchObject({ mode: 'deployed', reason: 'env_unreadable' })
  expect(out.renderModeTable([final]).split('\n')[1]).toBe(
    'a         deployed  its environment variables are encrypted with a KMS key you cannot decrypt (needs kms:Decrypt)',
  )
})

test('session lines', () => {
  expect(out.startupSummary({ devCount: 5, total: 7, seconds: 11.42 })).toBe(
    'Dev Mode on · 5 of 7 functions (11.4s)',
  )
  expect(out.restoredLine({ count: 1, seconds: 2.04 })).toBe(
    'Dev Mode off · 1 function restored (2.0s)',
  )
  expect(out.restoredLine({ count: 0, seconds: 0.2 })).toBe(
    'Dev Mode off · nothing to restore',
  )
  expect(out.keptLine(2)).toBe(
    'Left 2 functions in Dev Mode (--on-exit keep). They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
  )
  expect(out.forceExitLines(['a', 'b'])).toEqual([
    'Exiting without waiting. Not restored: a, b.',
    'They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
  ])
  expect(out.forceExitLines([])).toEqual(['Exiting.'])
  expect(
    out.notRestoredLines([{ name: 'a', message: 'Rate exceeded' }])[0],
  ).toEqual(['warning', '1 function not restored: a (Rate exceeded).'])
  expect(out.protectedStageMessage('Prod')).toBe(
    'Dev Mode does not run on stage "Prod": it changes the live configuration of deployed functions. Use a personal or development stage, for example "serverless dev --stage <your-name>".',
  )
  expect(out.forceExitDuringDeployLine('alice')).toBe(
    'Exiting without waiting. The deployment of stage "alice" may continue in AWS CloudFormation; no function was attached.',
  )
  expect(out.takenOverLine([{ name: 'a' }])).toBe(
    'a was taken over by another session and left with it.',
  )
  expect(out.takenOverLine([{ name: 'a' }, { name: 'b' }, { name: 'c' }])).toBe(
    'a, b and c were taken over by another session and left with it.',
  )
  expect(out.deployFirstLine('bob')).toBe(
    'Stage "bob" is not deployed yet: deploying it first.',
  )
})

test('the spinner says what a stop does, and how to exit without waiting', () => {
  const again = 'press Ctrl+C again to exit without waiting'
  expect(out.stoppingProgress({ count: 3 })).toBe(
    `Restoring 3 functions · ${again}`,
  )
  expect(out.stoppingProgress({ count: 1 })).toBe(
    `Restoring 1 function · ${again}`,
  )
  expect(out.stoppingProgress({ count: 3, keep: true })).toBe(
    `Stopping · ${again}`,
  )
  expect(out.stoppingProgress({ count: 0 })).toBe(`Stopping · ${again}`)
  expect(out.stoppingProgress({ deploying: true, count: 0 })).toBe(
    `Stopping after the deployment · ${again}`,
  )
  expect(out.restoringProgress({ done: 2, total: 3, stopping: true })).toBe(
    `Restoring 3 functions (2/3) · ${again}`,
  )
  expect(out.restoringProgress({ done: 0, total: 1 })).toBe(
    'Restoring 1 function (0/1)',
  )
})

test('the account setup says once what it did, nothing when it did nothing', () => {
  expect(
    out.accountSetupDoneLine({
      region: 'us-east-1',
      createdRole: 'serverless-dev-broker-us-east-1',
      layers: ['serverless-dev-arm64'],
    }),
  ).toBe(
    'Set up Dev Mode in us-east-1: created IAM role serverless-dev-broker-us-east-1, published layer serverless-dev-arm64',
  )
  expect(
    out.accountSetupDoneLine({
      region: 'eu-west-1',
      repairedRole: 'serverless-dev-broker-eu-west-1',
    }),
  ).toBe(
    'Set up Dev Mode in eu-west-1: repaired IAM role serverless-dev-broker-eu-west-1',
  )
  expect(out.accountSetupDoneLine({ region: 'us-east-1' })).toBeNull()
})

test('a role an earlier run created moments ago is in use, with its age, not created', () => {
  const nowMs = Date.parse('2026-10-05T10:43:00Z')
  const name = 'serverless-dev-broker-us-east-1'
  expect(
    out.accountSetupDoneLine({
      region: 'us-east-1',
      usedRole: { name, createdAt: new Date('2026-10-05T10:40:01Z') },
      nowMs,
    }),
  ).toBe(
    `Set up Dev Mode in us-east-1: using IAM role ${name} (created 2 min ago)`,
  )
  expect(
    out.accountSetupDoneLine({
      region: 'us-east-1',
      usedRole: { name, createdAt: new Date('2026-10-05T10:42:30Z') },
      layers: ['serverless-dev-arm64'],
      nowMs,
    }),
  ).toBe(
    `Set up Dev Mode in us-east-1: using IAM role ${name} (created less than a minute ago), published layer serverless-dev-arm64`,
  )
  // Repaired as well: the role is named once, with its age.
  expect(
    out.accountSetupDoneLine({
      region: 'us-east-1',
      usedRole: { name, createdAt: new Date('2026-10-05T10:41:00Z') },
      repairedRole: name,
      nowMs,
    }),
  ).toBe(
    `Set up Dev Mode in us-east-1: repaired IAM role ${name} (created 2 min ago)`,
  )
})

test('the function table shows only when it says more than the ready line', () => {
  const dev = { function: 'a', mode: 'dev', notes: [] }
  expect(out.tableWorthShowing([dev, { ...dev, function: 'b' }])).toBe(false)
  expect(
    out.tableWorthShowing([
      { ...dev, notes: [{ reason: 'reattached', message: 'x' }] },
    ]),
  ).toBe(false)
  expect(out.tableWorthShowing(rows)).toBe(true)
  expect(
    out.tableWorthShowing([
      { ...dev, notes: [{ reason: 'vpc_egress_required', message: 'x' }] },
    ]),
  ).toBe(true)
  expect(
    out.tableWorthShowing([{ function: 'a', mode: 'deployed', why: 'w' }]),
  ).toBe(true)
})

describe('the start-up lines of the endpoints and the web apps', () => {
  // As endpointListsOf (../control/endpoints.js) gives them (its `rows`): `endpoints` and `mcp` labelled,
  // `webAppUrls` each web app's real URL and custom domains. `webApps` are the web apps that run
  // here, with their mode and the URL on this machine.
  const API = 'https://abcde12345.execute-api.us-east-1.amazonaws.com'
  const SITE = 'https://siteexample12345.mrc.lambda-web.us-east-1.on.aws'
  const ADMIN = 'https://adminexample1234.mrc.lambda-web.us-east-1.on.aws'
  const http = (n) => ({
    label: `GET /items/${n}`,
    url: `${API}/dev/items/${n}`,
  })

  test('a function with an API endpoint and a web app in dev mode', () => {
    expect(
      out.endpointLines({
        endpoints: [{ label: 'GET /hello', url: `${API}/hello` }],
        webAppUrls: [{ name: 'site', url: SITE }],
        webApps: [
          { name: 'site', mode: 'dev', localUrl: 'http://localhost:39729' },
        ],
      }),
    ).toEqual([
      ['endpoints:', `  GET /hello  ${API}/hello`].join('\n'),
      ['web apps:', `  site  ${SITE}`, '        http://localhost:39729'].join(
        '\n',
      ),
    ])
  })

  test('endpoints of each kind: the URLs aligned in one column, one endpoint in the block too', () => {
    expect(
      out.endpointLines({
        endpoints: [
          { label: 'GET /', url: `${API}/dev` },
          { label: 'ANY /proxy/{any+}', url: `${API}/dev/proxy/{any+}` },
          {
            label: 'WebSocket',
            url: 'wss://w.execute-api.us-east-1.amazonaws.com/dev',
          },
          { label: 'CloudFront', url: 'd111.cloudfront.net' },
          { label: 'stream', url: 'https://s.lambda-url.us-east-1.on.aws/' },
        ],
      }),
    ).toEqual([
      [
        'endpoints:',
        `  GET /              ${API}/dev`,
        `  ANY /proxy/{any+}  ${API}/dev/proxy/{any+}`,
        '  WebSocket          wss://w.execute-api.us-east-1.amazonaws.com/dev',
        '  CloudFront         d111.cloudfront.net',
        '  stream             https://s.lambda-url.us-east-1.on.aws/',
      ].join('\n'),
    ])
    expect(out.endpointLines({ endpoints: [http(1)] })).toEqual([
      `endpoints:\n  GET /items/1  ${API}/dev/items/1`,
    ])
  })

  test('a function URL alone: its function names it', () => {
    expect(
      out.endpointLines({
        endpoints: [
          { label: 'web', url: 'https://x.lambda-url.us-east-1.on.aws/' },
        ],
      }),
    ).toEqual(['endpoints:\n  web  https://x.lambda-url.us-east-1.on.aws/'])
  })

  test('several web apps, one --local-only: names and URLs aligned, custom domains under the real URL', () => {
    expect(
      out.endpointLines({
        webAppUrls: [
          { name: 'site', url: SITE },
          { name: 'site', url: 'https://www.example.com' },
          { name: 'admin', url: ADMIN },
          { name: 'docs', url: 'https://docs.lambda-web.us-east-1.on.aws' },
        ],
        webApps: [
          { name: 'site', mode: 'dev', localUrl: 'http://localhost:52341' },
          { name: 'admin', mode: 'dev', localUrl: 'http://localhost:52357' },
          { name: 'docs', mode: 'local', localUrl: 'http://localhost:52360' },
        ],
      }),
    ).toEqual([
      [
        'web apps:',
        `  site   ${SITE}`,
        '         https://www.example.com',
        '         http://localhost:52341',
        `  admin  ${ADMIN}`,
        '         http://localhost:52357',
        '  docs   http://localhost:52360  (local only)',
      ].join('\n'),
    ])
  })

  test('a --local-only web app alone', () => {
    expect(
      out.endpointLines({
        webAppUrls: [{ name: 'admin', url: ADMIN }],
        webApps: [
          { name: 'admin', mode: 'local', localUrl: 'http://localhost:4000' },
        ],
      }),
    ).toEqual(['web apps:\n  admin  http://localhost:4000  (local only)'])
  })

  test('in colour, the headings and (local only) are dim, the names and URLs plain', () => {
    const saved = getColorSettingsForTests()
    setColorSettingsForTests({ chalkLevel: 1, colorSupportLevel: 1 })
    try {
      expect(
        out.endpointLines({
          webAppUrls: [{ name: 'site', url: SITE }],
          webApps: [
            { name: 'site', mode: 'dev', localUrl: 'http://localhost:1' },
            { name: 'admin', mode: 'local', localUrl: 'http://localhost:2' },
          ],
        }),
      ).toEqual([
        [
          style.aside('web apps:'),
          `  site   ${SITE}`,
          '         http://localhost:1',
          `  admin  http://localhost:2  ${style.aside('(local only)')}`,
        ].join('\n'),
      ])
      expect(style.aside('(local only)')).not.toBe('(local only)')
    } finally {
      setColorSettingsForTests(saved)
    }
  })

  test('web apps only, and a web app the session does not run is not listed', () => {
    expect(
      out.endpointLines({
        webAppUrls: [
          { name: 'site', url: SITE },
          { name: 'admin', url: ADMIN },
        ],
        webApps: [
          { name: 'site', mode: 'dev', localUrl: 'http://localhost:39729' },
        ],
      }),
    ).toEqual([
      ['web apps:', `  site  ${SITE}`, '        http://localhost:39729'].join(
        '\n',
      ),
    ])
  })

  test('a web app in dev mode without a known real URL, or not yet listening here', () => {
    expect(
      out.endpointLines({
        webApps: [
          { name: 'site', mode: 'dev', localUrl: 'http://localhost:39729' },
          { name: 'api', mode: 'dev', url: ADMIN },
        ],
      }),
    ).toEqual([
      ['web apps:', '  site  http://localhost:39729', `  api   ${ADMIN}`].join(
        '\n',
      ),
    ])
  })

  test('functions only: no web apps section', () => {
    expect(out.endpointLines({ endpoints: [http(1), http(2)] })).toEqual([
      [
        'endpoints:',
        `  GET /items/1  ${API}/dev/items/1`,
        `  GET /items/2  ${API}/dev/items/2`,
      ].join('\n'),
    ])
  })

  test('the MCP servers: their own section, after the web apps, in the same shape', () => {
    expect(
      out.endpointLines({
        endpoints: [http(1)],
        mcp: [
          { name: 'crm', url: `${API}/dev/crm/mcp` },
          { name: 'docs', url: `${API}/dev/docs/mcp` },
        ],
        webApps: [
          { name: 'site', mode: 'local', localUrl: 'http://localhost:1' },
        ],
      }),
    ).toEqual([
      `endpoints:\n  GET /items/1  ${API}/dev/items/1`,
      'web apps:\n  site  http://localhost:1  (local only)',
      [
        'mcp:',
        `  crm   ${API}/dev/crm/mcp`,
        `  docs  ${API}/dev/docs/mcp`,
      ].join('\n'),
    ])
  })

  test('more than ten endpoints: the first ten, then how many more', () => {
    const [section] = out.endpointLines({
      endpoints: Array.from({ length: 13 }, (_, i) => http(i + 1)),
    })
    const lines = section.split('\n')
    expect(lines).toHaveLength(12)
    expect(lines[10]).toBe(`  GET /items/10  ${API}/dev/items/10`)
    expect(lines[11]).toBe('  ... and 3 more')
  })

  test('without a limit, every endpoint', () => {
    const [section] = out.endpointLines(
      { endpoints: Array.from({ length: 13 }, (_, i) => http(i + 1)) },
      { limit: Infinity },
    )
    expect(section.split('\n')).toHaveLength(14)
  })

  test('lines of a session of an earlier version, as text, are listed as they are', () => {
    expect(
      out.endpointLines({
        endpoints: [`GET - ${API}/hello`, `site: ${SITE}`],
        mcp: [`crm → ${API}/crm/mcp`],
      }),
    ).toEqual([
      `endpoints:\n  GET - ${API}/hello\n  site: ${SITE}`,
      `mcp:\n  crm → ${API}/crm/mcp`,
    ])
  })

  test('nothing to list: no line', () => {
    expect(
      out.endpointLines({
        endpoints: [],
        mcp: [],
        webAppUrls: [],
        webApps: [],
      }),
    ).toEqual([])
    expect(out.endpointLines()).toEqual([])
  })
})

test('one function reads in the singular; the plural strings stay as they are', () => {
  expect(out.keptLine(1)).toBe(
    'Left 1 function in Dev Mode (--on-exit keep). It runs the deployed code until the next serverless dev, deploy, remove or dev restore.',
  )
  expect(out.forceExitLines(['a'])).toEqual([
    'Exiting without waiting. Not restored: a.',
    'It runs the deployed code until the next serverless dev, deploy, remove or dev restore.',
  ])
  expect(out.notRestoredLines([{ name: 'a', message: 'x' }])).toEqual([
    ['warning', '1 function not restored: a (x).'],
    [
      'warning',
      'It runs the deployed code until restored: run "serverless dev restore --function a".',
    ],
    [
      'debug',
      'The Dev Mode bridge passes invocations through to the deployed code when no session is connected.',
    ],
  ])
  expect(
    out.notRestoredLines([
      { name: 'a', message: 'x' },
      { name: 'b', message: 'y' },
    ])[1],
  ).toEqual([
    'warning',
    'They run the deployed code until restored: run "serverless dev restore --function a --function b".',
  ])
  const alice = { stage: 'alice', region: 'eu-west-1' }
  expect(
    out.notRestoredLines([{ name: 'a', message: 'x' }], { scope: alice })[1],
  ).toEqual([
    'warning',
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function a".',
  ])
  // The retry names each function by its key in serverless.yml, which may differ from the name shown.
  expect(
    out.notRestoredLines([{ name: 'svc-alice-a', message: 'x' }], {
      scope: alice,
      keyOf: (name) => name.replace('svc-alice-', ''),
    }),
  ).toEqual([
    ['warning', '1 function not restored: svc-alice-a (x).'],
    [
      'warning',
      'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function a".',
    ],
    ['debug', expect.any(String)],
  ])
  expect(
    out.notRestoredLines(
      [
        { name: 'a', message: 'x' },
        { name: 'b', message: 'y' },
      ],
      { scope: alice },
    )[1],
  ).toEqual([
    'warning',
    'They run the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function a --function b".',
  ])
  expect(
    out
      .restoreReportLines({
        result: {
          restored: [],
          unchanged: [],
          skipped: [],
          failed: [{ name: 'a', message: 'x' }],
        },
        seconds: 1,
        scope: alice,
      })
      .filter(([level]) => level === 'warning')
      .at(-1),
  ).toEqual([
    'warning',
    'It runs the deployed code until restored: run "serverless dev restore --stage alice --region eu-west-1 --function a".',
  ])
  expect(out.stopFailedLine(new Error('Rate exceeded.'), alice)).toBe(
    'Dev Mode could not stop cleanly (Rate exceeded.). Run "serverless dev restore --stage alice --region eu-west-1" to restore your functions.',
  )
  expect(
    out.sessionUnreachableLine({
      session_id: 's_1',
      pid: 42,
      ...alice,
    }),
  ).toBe(
    'The Dev Mode session here (session s_1, pid 42, stage alice) could not open its control endpoint, so no command can reach it. Stop it with Ctrl+C in its terminal, then run "serverless dev restore --stage alice --region eu-west-1" if it left functions in Dev Mode. If that process is not a Dev Mode session any more, delete .serverless/dev/session.json.',
  )
})

test('a row or message is never printed without its content', () => {
  const row = { function: 'a', mode: 'dev', notes: [] }
  expect(
    out.finalRow(row, { status: 'rejected', reason: 'package_too_large' }),
  ).toEqual({
    function: 'a',
    mode: 'deployed',
    reason: 'package_too_large',
    why: 'package_too_large',
    notes: [],
  })
  expect(out.finalRow(row, { status: 'rejected' })).toMatchObject({
    reason: 'attach_rejected',
    why: 'attach rejected',
  })
  expect(out.finalRow(row, { status: 'failed' })).toMatchObject({
    reason: 'attach_failed',
    why: 'attach failed',
  })
  expect(out.finalRow(row, { status: 'surprising' })).toMatchObject({
    mode: 'deployed',
    reason: 'attach_failed',
    why: 'attach failed',
  })
  expect(out.finalRow(row, { status: 'skipped' })).toMatchObject({
    mode: 'skipped',
    why: 'not attached',
  })
  expect(out.notRestoredLines([{ name: 'a' }])[0]).toEqual([
    'warning',
    '1 function not restored: a (restore failed).',
  ])
  for (const line of [
    ...out
      .notRestoredLines([{ name: 'a' }, { name: 'b', message: '' }])
      .map(([, text]) => text),
    out.renderModeTable([out.finalRow(row, { status: 'failed' })]),
  ]) {
    expect(line).not.toMatch(/undefined|\(\)/)
  }
})

test('a failure message that is a sentence does not end in a doubled period', () => {
  expect(
    out.notRestoredLines([
      { name: 'a', message: 'Nothing was changed; restore it again.' },
      { name: 'b', message: 'Rate exceeded' },
    ])[0][1],
  ).toBe(
    '2 functions not restored: a (Nothing was changed; restore it again), b (Rate exceeded).',
  )
})

test('restore notes are shown under the function they belong to', () => {
  const restored = [
    { name: 'a', status: 'restored', notes: [] },
    {
      name: 'b',
      status: 'restored',
      notes: [
        {
          reason: 'original_wrapper_dropped',
          message:
            'its exec wrapper /opt/x was not put back: the layer that provides it is no longer attached',
        },
      ],
    },
  ]
  const unchanged = [
    { name: 'c', status: 'unchanged' },
    {
      name: 'd',
      status: 'unchanged',
      notes: [{ reason: 'env_unreadable', message: 'cannot read it' }],
    },
  ]
  expect(out.restoreNoteLines([...restored, ...unchanged])).toEqual([
    '  b: its exec wrapper /opt/x was not put back: the layer that provides it is no longer attached',
    '  d: cannot read it',
  ])
  expect(out.restoreNoteLines([])).toEqual([])
})

test('formatAgo', () => {
  const now = 1790000000 * 1000
  expect(out.formatAgo(1790000000 - 30, now)).toBe('less than a minute ago')
  expect(out.formatAgo(1790000000 - 600, now)).toBe('10 min ago')
  expect(out.formatAgo(1790000000 - 3 * 3600, now)).toBe('3 h ago')
  expect(out.formatAgo(1790000000 - 2 * 86400, now)).toBe('2 d ago')
  expect(out.formatAgo(undefined, now)).toBe('at an unknown time')
  expect(out.formatAgo(1790000000 - 12, now, { seconds: true })).toBe(
    '12 s ago',
  )
  expect(out.formatAgo(1790000000 - 600, now, { seconds: true })).toBe(
    '10 min ago',
  )
})

test('leftoverLine names how old the earlier session is', () => {
  const now = 1790000000 * 1000
  expect(
    out.leftoverLine(
      [{ function: 'a', attachment: { attachedAt: 1790000000 - 3 * 3600 } }],
      now,
    ),
  ).toBe(
    '1 function still had Dev Mode configuration from an earlier session of yours (3 h ago); attached it to this session.',
  )
  expect(out.leftoverLine([{ function: 'a' }, { function: 'b' }], now)).toBe(
    '2 functions still had Dev Mode configuration from an earlier session of yours (at an unknown time); attached them to this session.',
  )
})

test('no line uses "local" or "cloud" for a mode', () => {
  const lines = [
    out.STOP_HINT,
    out.stoppingProgress({ count: 2 }),
    out.stoppingProgress({ deploying: true }),
    out.restoringProgress({ done: 1, total: 2, stopping: true }),
    out.forceExitDuringDeployLine('alice'),
    out.restoredLine({ count: 2, seconds: 1 }),
    out.deployFirstLine('alice'),
    ...out.notRestoredLines([{ name: 'a', message: 'x' }]).map(([, t]) => t),
    ...out.forceExitLines(['a']),
    out.keptLine(1),
    out.removalSkippedLine(),
  ]
  for (const line of lines) expect(line).not.toMatch(/\blocal\b|\bcloud\b/i)
})

test('the restore report counts only functions that were really restored', () => {
  const result = {
    restored: [
      { name: 'a', status: 'restored', notes: [] },
      {
        name: 'b',
        status: 'restored',
        notes: [
          { reason: 'original_wrapper_dropped', message: 'wrapper gone' },
        ],
      },
    ],
    unchanged: [{ name: 'c', status: 'unchanged' }],
    missing: [{ name: 'd', status: 'missing' }],
    skipped: [],
    failed: [],
  }
  expect(out.restoredCount(result)).toBe(2)
  expect(out.restoreReportLines({ result, seconds: 1.25 })).toEqual([
    ['success', 'Dev Mode off · 2 functions restored (1.3s)'],
    ['aside', '  b: wrapper gone'],
    ['debug', 'Already on the deployed configuration: c.'],
  ])
})

test('the restore report names functions by key when it is given how', () => {
  const result = {
    restored: [],
    unchanged: [],
    missing: [],
    skipped: [
      { name: 'svc-dev-jobs', status: 'skipped' },
      { name: 'svc-dev-api', status: 'skipped' },
    ],
    failed: [],
  }
  const nameOf = (name) => name.replace('svc-dev-', '')
  expect(out.restoreReportLines({ result, seconds: 0.2, nameOf })).toEqual([
    ['success', 'Dev Mode off · nothing to restore'],
    [
      'notice',
      'jobs and api were taken over by another session and left with it.',
    ],
  ])
})

test('a restore whose functions another command already restored says so', () => {
  const result = {
    restored: [],
    unchanged: [
      { name: 'a', status: 'unchanged' },
      { name: 'b', status: 'unchanged' },
    ],
    missing: [],
    skipped: [],
    failed: [],
  }
  expect(out.restoreReportLines({ result, seconds: 0.2 })).toEqual([
    ['success', 'Dev Mode off · nothing to restore'],
    ['debug', 'Already on the deployed configuration: a, b.'],
  ])
})

test('the restore report names what was taken over and what failed', () => {
  const result = {
    restored: [{ name: 'a', status: 'restored' }],
    unchanged: [],
    missing: [],
    skipped: [{ name: 'b', status: 'skipped' }],
    failed: [{ name: 'c', status: 'failed', message: 'Rate exceeded' }],
  }
  const lines = out.restoreReportLines({ result, seconds: 2 })
  expect(lines[0]).toEqual([
    'error',
    'Restore incomplete · 1 of 2 functions restored (2.0s)',
  ])
  expect(lines).toContainEqual([
    'notice',
    'b was taken over by another session and left with it.',
  ])
  expect(lines).toContainEqual([
    'warning',
    '1 function not restored: c (Rate exceeded).',
  ])
})

test('a restore where every function failed does not read as done', () => {
  const result = {
    restored: [],
    unchanged: [],
    missing: [],
    skipped: [],
    failed: [{ name: 'a', status: 'failed', message: 'Rate exceeded' }],
  }
  const lines = out.restoreReportLines({ result, seconds: 1 })
  expect(lines[0]).toEqual([
    'error',
    'Restore incomplete · 0 of 1 function restored (1.0s)',
  ])
  expect(lines.map(([, text]) => text).join('\n')).not.toContain('Dev Mode off')
})

test('a restore of functions and web apps that is incomplete counts them together', () => {
  const result = {
    restored: [
      { name: 'svc-dev-fn', status: 'restored' },
      { name: 'svc-dev-cmd', status: 'restored', webApp: true },
    ],
    unchanged: [],
    missing: [],
    skipped: [],
    failed: [
      {
        name: 'svc-dev-api',
        status: 'failed',
        webApp: true,
        message: 'Rate exceeded',
      },
    ],
  }
  const lines = out.restoreReportLines({ result, seconds: 3 })
  // Not "2 of 1 function and 2 web apps": the count and the total are of the same things.
  expect(lines[0]).toEqual([
    'error',
    'Restore incomplete · 2 of 3 functions and web apps restored (3.0s)',
  ])
  // Web apps alone, or functions alone, keep their own word.
  expect(
    out.restoreIncompleteLine({ count: 0, total: 1, seconds: 1, webApps: 1 }),
  ).toBe('Restore incomplete · 0 of 1 web app restored (1.0s)')
})

test('a command that restores first keeps its own outcome line', () => {
  const result = {
    restored: [{ name: 'a', status: 'restored' }],
    unchanged: [],
    missing: [],
    skipped: [],
    failed: [],
  }
  expect(
    out.restoreReportLines({
      result,
      seconds: 1,
      outcome: ['notice', 'Restored 1 function from Dev Mode'],
    }),
  ).toEqual([['notice', 'Restored 1 function from Dev Mode']])
})

test('a restore that does not finish in time names what is left', () => {
  expect(out.restoreTimeoutLines(['a', 'b'], 300_000)).toEqual([
    'Restoring did not finish within 5 min. Not restored: a, b.',
    'They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
  ])
})

test('a command that restored the stage first names owners and age', () => {
  const now = 1790000000 * 1000
  expect(
    out.restoredBeforeCommandLine({
      found: [
        {
          name: 'a',
          attachment: { owner: 'alice@mbp', attachedAt: 1790000000 - 7200 },
        },
        { name: 'b', attachment: null },
      ],
      count: 2,
      nowMs: now,
    }),
  ).toBe('Restored 2 functions from Dev Mode (alice@mbp, 2 h ago)')
  expect(
    out.restoredBeforeCommandLine({
      found: [{ name: 'a', attachment: null, unreadable: true }],
      count: 1,
      nowMs: now,
    }),
  ).toBe('Restored 1 function from Dev Mode')
  expect(out.restoringBeforeCommandProgress(3)).toBe(
    'Restoring 3 functions from Dev Mode',
  )
})

test('a restore before a command keeps the functions line as it was; only a web app hides an unknown owner', () => {
  const now = 1790000000 * 1000
  const fn = (owner) => ({
    name: 'a',
    attachment: { owner, attachedAt: 1790000000 - 7200 },
  })
  // Functions only: as before web apps, an owner of "unknown" is named.
  expect(
    out.restoredBeforeCommandLine({
      found: [fn('unknown')],
      count: 1,
      nowMs: now,
    }),
  ).toBe('Restored 1 function from Dev Mode (unknown, 2 h ago)')
  expect(
    out.restoredBeforeCommandLine({
      found: [fn('alice@mbp')],
      count: 1,
      nowMs: now,
      webApps: [{ key: 'api', owner: 'unknown' }],
    }),
  ).toBe(
    'Restored 1 function and the web app api from Dev Mode (alice@mbp, 2 h ago)',
  )
  // No owner left once the web app's "unknown" is dropped: the age still shows.
  expect(
    out.restoredBeforeCommandLine({
      found: [fn(undefined)],
      count: 1,
      nowMs: now,
      webApps: [{ key: 'api', owner: 'unknown' }],
    }),
  ).toBe('Restored 1 function and the web app api from Dev Mode (2 h ago)')
  expect(
    out.restoredBeforeCommandLine({
      found: [],
      count: 0,
      nowMs: now,
      webApps: [
        { key: 'api', owner: 'unknown' },
        { key: 'admin', owner: 'bob@desk' },
      ],
    }),
  ).toBe('Restored the web apps api and admin from Dev Mode (bob@desk)')
  expect(
    out.restoredBeforeCommandLine({
      found: [],
      count: 0,
      nowMs: now,
      webApps: [{ key: 'api', owner: 'unknown' }],
    }),
  ).toBe('Restored the web app api from Dev Mode')
})

test('restore-first tells a session that may still be running that it loses its functions', () => {
  expect(out.runningSessionLine({ verb: 'deploy', count: 3 })).toBe(
    'If a "serverless dev" session is still running on this stage, it no longer has these functions: start it again after the deploy.',
  )
  expect(out.runningSessionLine({ verb: 'rollback', count: 2 })).toBe(
    'If a "serverless dev" session is still running on this stage, it no longer has these functions: start it again after the rollback.',
  )
  expect(out.runningSessionLine({ verb: 'removal', count: 2 })).toBe(
    'If a "serverless dev" session is still running on this stage, it no longer has these functions: stop it.',
  )
  expect(out.runningSessionLine({ verb: 'deploy', count: 1 })).toBe(
    'If a "serverless dev" session is still running on this stage, it no longer has this function: start it again after the deploy.',
  )
})

test('dev restore lists what it restores, with owner and age', () => {
  const now = 1790000000 * 1000
  expect(out.restoringStageLine({ stage: 'alice' })).toBe(
    'Functions with Dev Mode configuration on stage "alice":',
  )
  expect(
    out.restoreCandidateLine(
      {
        name: 'svc-alice-api',
        attachment: { owner: 'bob@desk', attachedAt: 1790000000 - 600 },
      },
      now,
    ),
  ).toBe('  svc-alice-api  (bob@desk, attached 10 min ago)')
  expect(
    out.restoreCandidateLine({ name: 'svc-alice-api', attachment: null }, now),
  ).toBe('  svc-alice-api  (incomplete Dev Mode configuration)')
  expect(
    out.restoreCandidateLine(
      { name: 'svc-alice-api', attachment: null, unreadable: true },
      now,
    ),
  ).toBe(
    '  svc-alice-api  (Dev Mode layer attached; its environment variables are encrypted with a KMS key you cannot decrypt (needs kms:Decrypt))',
  )
})

test('dev restore with nothing to restore says where it looked', () => {
  expect(out.nothingToRestoreLine({ stage: 'alice' })).toBe(
    'No function on stage "alice" has Dev Mode configuration.',
  )
  expect(out.nothingToRestoreLine({ stage: 'alice', only: ['api'] })).toBe(
    'Function api on stage "alice" has no Dev Mode configuration.',
  )
  expect(
    out.nothingToRestoreLine({ stage: 'alice', only: ['api', 'worker'] }),
  ).toBe(
    'Functions api, worker on stage "alice" have no Dev Mode configuration.',
  )
})

test('restore lines never use "local" or "cloud" for a mode', () => {
  const now = 1790000000 * 1000
  const lines = [
    out.restoredBeforeCommandLine({
      found: [{ name: 'a', attachment: null }],
      count: 1,
      nowMs: now,
    }),
    out.restoringBeforeCommandProgress(2),
    out.runningSessionLine({ verb: 'deploy', count: 2 }),
    out.runningSessionLine({ verb: 'removal', count: 1 }),
    out.restoringStageLine({ stage: 's' }),
    out.restoreCandidateLine(
      { name: 'a', attachment: null, unreadable: true },
      now,
    ),
    out.nothingToRestoreLine({ stage: 's' }),
  ]
  for (const line of lines) expect(line).not.toMatch(/\blocal\b|\bcloud\b/i)
})

test('leftDevModeLine explains each way a function leaves Dev Mode', () => {
  expect(out.leftDevModeLine({ name: 'a', state: 'wrapper_replaced' })).toBe(
    'a left Dev Mode: something else changed its AWS_LAMBDA_EXEC_WRAPPER (for example Dashboard instrumentation); it runs the deployed code.',
  )
  expect(out.leftDevModeLine({ name: 'a', state: 'detached' })).toBe(
    'a left Dev Mode: its Dev Mode configuration was removed elsewhere (serverless deploy, dev restore or another tool).',
  )
  expect(
    out.leftDevModeLine({ name: 'a', state: 'taken_over', owner: 'bob@desk' }),
  ).toBe('a left Dev Mode: bob@desk took it over with --take-over.')
  expect(out.leftDevModeLine({ name: 'a', state: 'function_deleted' })).toBe(
    'a left Dev Mode: the function no longer exists.',
  )
})

test('leftDevModeLine says when a function can no longer be checked, without claiming it left', () => {
  expect(out.leftDevModeLine({ name: 'a', state: 'env_unreadable' })).toBe(
    `a can no longer be checked: ${ENV_UNREADABLE_WHY}; restoring it on exit needs that access back.`,
  )
})

test('leftDevModeLine names a take-over by the same person and a lost layer', () => {
  expect(out.leftDevModeLine({ name: 'a', state: 'taken_over_by_you' })).toBe(
    'a left Dev Mode: another Dev Mode session of yours attached it.',
  )
  expect(
    out.leftDevModeLine(
      { name: 'a', state: 'layer_missing' },
      { stage: 'alice', region: 'eu-west-1' },
    ),
  ).toBe(
    'a lost the Dev Mode layer but still points at its wrapper (AWS_LAMBDA_EXEC_WRAPPER); it cannot start until it is restored (serverless dev restore --stage alice --region eu-west-1).',
  )
})

test('lostWhy says in the function table why a function no longer runs here', () => {
  const why = (change) => out.lostWhy(change)
  expect(why({ state: 'taken_over', owner: 'bob@desk' })).toBe(
    'taken over by bob@desk (--take-over)',
  )
  expect(why({ state: 'taken_over_by_you' })).toBe(
    'taken over by another session of yours',
  )
  expect(why({ state: 'wrapper_replaced' })).toBe(
    'left Dev Mode: something else changed its AWS_LAMBDA_EXEC_WRAPPER',
  )
  expect(why({ state: 'detached' })).toBe(
    'left Dev Mode: its Dev Mode configuration was removed elsewhere',
  )
  expect(why({ state: 'function_deleted' })).toBe(
    'the function no longer exists',
  )
  expect(why({ state: 'layer_missing' })).toBe(
    'lost the Dev Mode layer; cannot start until it is restored',
  )
  expect(why({ state: 'env_unreadable' })).toBe(
    `can no longer be checked: ${ENV_UNREADABLE_WHY}`,
  )
})

test('watchFailingLine says once that the checks keep failing', () => {
  expect(out.watchFailingLine({ count: 3, error: 'Rate exceeded.' })).toBe(
    'Dev Mode could not check the attached functions the last 3 times (Rate exceeded). It keeps trying; later failures show with --debug only.',
  )
  expect(
    out.watchFailingLine({
      count: 3,
      error: 'Rate exceeded.',
      what: { functions: false, webApps: true },
    }),
  ).toBe(
    'Dev Mode could not check the attached web apps the last 3 times (Rate exceeded). It keeps trying; later failures show with --debug only.',
  )
})

// Rejected credentials, as Dev Mode's clients make them for the profile "dev".
const rejected = () =>
  credentialsInvalidError(
    Object.assign(
      new Error('The security token included in the request is expired'),
      {
        name: 'ExpiredTokenException',
      },
    ),
    'eu-west-1',
    { source: 'profile', profile: 'dev' },
  )
const ADVICE =
  'The credentials come from AWS profile "dev": sign in again with "serverless login aws --aws-profile dev" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile\'s keys, or choose another profile with --aws-profile.'

test('inside parentheses, rejected credentials read as the AWS message, with the advice once after', () => {
  expect(out.parenthesized(rejected())).toEqual({
    inside: 'The security token included in the request is expired',
    after: ADVICE,
  })
  expect(out.parenthesized(new Error('stop broke.'))).toEqual({
    inside: 'stop broke.',
    after: '',
  })
  expect(out.parenthesized('plain text')).toEqual({
    inside: 'plain text',
    after: '',
  })
  expect(out.watchFailingLine({ count: 3, error: rejected() })).toBe(
    `Dev Mode could not check the attached functions the last 3 times (The security token included in the request is expired). ${ADVICE} It keeps trying; later failures show with --debug only.`,
  )
})

test('a session of the same scope is described by its state', () => {
  const record = { session_id: 's_3f2a9c1e0b4d', pid: 41234, stage: 'dev' }
  expect(out.sessionHereLine({ ...record, state: 'on' })).toBe(
    'Dev Mode is already on here (session s_3f2a9c1e0b4d, pid 41234, stage dev).',
  )
  expect(out.sessionHereLine({ ...record, state: 'starting' })).toBe(
    'Dev Mode is starting here (session s_3f2a9c1e0b4d, pid 41234, stage dev).',
  )
  expect(out.sessionHereLine({ ...record, state: 'stopping' })).toBe(
    'Dev Mode is stopping here (session s_3f2a9c1e0b4d, pid 41234, stage dev).',
  )
  // Never called starting when the file says otherwise.
  expect(out.sessionHereLine({ ...record, state: 'failed' })).toBe(
    'A Dev Mode session is here (session s_3f2a9c1e0b4d, pid 41234, stage dev); its session file says "failed".',
  )
})

describe('the line for settings a running session keeps', () => {
  const record = { idle_timeout_s: null }
  const kept = (names, verb) =>
    `The running session keeps the settings it started with: ${names} ${verb} only to a new one. Run "serverless dev stop", then start again to use them.`

  test('names --take-over and --on-exit only when the running session started without them', () => {
    const options = { 'take-over': true, 'on-exit': 'keep' }
    expect(
      out.keptSettingsLine({
        record: { ...record, take_over: true, on_exit: 'keep' },
        options,
      }),
    ).toBeNull()
    expect(out.keptSettingsLine({ record, options })).toBe(
      kept('--take-over and --on-exit keep', 'apply'),
    )
    expect(
      out.keptSettingsLine({
        record: { ...record, take_over: true, on_exit: 'keep' },
        options: { 'take-over': true, 'on-exit': 'remove' },
      }),
    ).toBe(kept('--on-exit remove', 'applies'))
    expect(
      out.keptSettingsLine({
        record: { ...record, on_exit: 'remove' },
        options: { 'take-over': true, 'on-exit': 'remove' },
      }),
    ).toBe(kept('--take-over', 'applies'))
  })

  test('a record that does not say how its session started gets them named, as given', () => {
    // A session file a session of an earlier version wrote, which has neither field.
    expect(
      out.keptSettingsLine({
        record: { idle_timeout_s: 3600 },
        options: { 'take-over': true, 'on-exit': 'keep', 'idle-timeout': '1h' },
      }),
    ).toBe(kept('--take-over and --on-exit keep', 'apply'))
  })
})

describe('web apps in the session lines', () => {
  const webRows = [
    { webApp: 'web', mode: 'dev', notes: [] },
    { webApp: 'admin', mode: 'local', notes: [] },
    {
      webApp: 'docs',
      mode: 'deployed',
      reason: 'build_output_entry',
      why: 'the entry is a build output; set webApps.docs.dev.command (for example: next dev)',
      notes: [],
    },
  ]

  test('web apps follow the functions in the same table, named as web apps, under "Name"', () => {
    expect(
      out.renderModeTable(
        [{ function: 'api', mode: 'dev', notes: [] }],
        webRows,
      ),
    ).toBe(
      [
        'Name             Mode      Why',
        'api              dev',
        'web (web app)    dev',
        'admin (web app)  local     on its local URL only (--local-only); its real URL serves the deployed code',
        'docs (web app)   deployed  the entry is a build output; set webApps.docs.dev.command (for example: next dev)',
      ].join('\n'),
    )
    // A service without web apps keeps its table as it was.
    expect(
      out.renderModeTable([{ function: 'api', mode: 'dev', notes: [] }]),
    ).toBe(['Function  Mode  Why', 'api       dev'].join('\n'))
    expect(out.tableWorthShowing([], [webRows[0]])).toBe(false)
    expect(out.tableWorthShowing([], [webRows[1]])).toBe(true)
  })

  test("a web app's server that does not listen, and a --local-only one without role credentials, say so in their row", () => {
    const web = out.withLiveNotes(webRows[0], {
      port: 51234,
      note: { reason: 'local_server_down', message: 'down' },
      credentials: 'relayed',
    })
    expect(web.notes.map((note) => note.reason)).toEqual(['local_server_down'])
    expect(out.webAppWhy(web)).toBe(
      'its server on this machine is not listening on port 51234; requests run the deployed code until it is',
    )
    const admin = out.withLiveNotes(webRows[1], {
      port: 51235,
      note: null,
      credentials: 'denied',
    })
    expect(out.webAppWhy(admin)).toBe(
      'on its local URL only (--local-only); its real URL serves the deployed code; runs without its role credentials: your AWS credentials may not call its endpoint sls-dev-local (lambda:InvokeWebFunctionEndpoint)',
    )
    expect(out.tableWorthShowing([], [web])).toBe(true)
    // Nothing to say: the row as it is.
    expect(out.withLiveNotes(webRows[0], { note: null })).toBe(webRows[0])
  })

  test('the ready line counts web apps beside the functions, or alone', () => {
    expect(
      out.startupSummary({
        devCount: 2,
        total: 3,
        seconds: 8.31,
        webApps: { running: 1, total: 2 },
      }),
    ).toBe('Dev Mode on · 2 of 3 functions and 1 of 2 web apps (8.3s)')
    expect(
      out.startupSummary({
        devCount: 0,
        total: 0,
        seconds: 4,
        webApps: { running: 1, total: 1 },
      }),
    ).toBe('Dev Mode on · 1 of 1 web app (4.0s)')
  })

  test('the hints and the stop lines name web apps', () => {
    expect(out.stopHint({ functions: true, webApps: true })).toBe(
      'Press Ctrl+C to restore your functions and web apps and exit.',
    )
    expect(out.stopHint({ functions: false, webApps: true })).toBe(
      'Press Ctrl+C to restore your web apps and exit.',
    )
    expect(out.agentHint(undefined, undefined, { webApps: true })).toBe(
      'Running under an AI agent: start with "serverless dev --detach", then use "serverless dev wait" and "serverless dev stop" (which restores your functions and web apps).',
    )
    expect(out.agentHint()).toBe(out.AGENT_HINT)
    expect(out.AGENT_HINT).toContain('(which restores your functions).')
    expect(out.stoppingProgress({ count: 3, webApps: 2 }).split(' · ')[0]).toBe(
      'Restoring 1 function and 2 web apps',
    )
    expect(out.stoppingProgress({ count: 3 }).split(' · ')[0]).toBe(
      'Restoring 3 functions',
    )
    expect(out.keptLine(1, 2)).toBe(
      'Left 1 function and 2 web apps in Dev Mode (--on-exit keep). They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
    )
    expect(out.keptLine(2)).toBe(
      'Left 2 functions in Dev Mode (--on-exit keep). They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
    )
    expect(
      out.forceExitLines(['svc-dev-api', out.webAppName('web')], {
        keep: true,
      }),
    ).toEqual([
      'Exiting without waiting. Left in Dev Mode: svc-dev-api, web (web app).',
      'They run the deployed code until the next serverless dev, deploy, remove or dev restore.',
    ])
    expect(out.forceExitLines(['svc-dev-api'])[0]).toBe(
      'Exiting without waiting. Not restored: svc-dev-api.',
    )
  })

  test('the plan lists the revisions and endpoints each web app gets', () => {
    const plan = out.buildPlan({
      stage: 'dev',
      deployFirst: false,
      brokerName: 'serverless-dev-broker-us-east-1',
      brokerExists: true,
      missingLayers: [],
      devRows: [],
      webRows,
      widenBroker: true,
    })
    expect(plan.accountSetup).toEqual([
      {
        action: 'widen_broker_trust',
        name: 'serverless-dev-broker-us-east-1',
      },
    ])
    expect(plan.webChanges).toEqual([
      {
        webApp: 'web',
        mode: 'dev',
        revisions: ['clone', 'dev'],
        endpoints: ['sls-dev-fallback'],
        main: 'dev_revision',
      },
      {
        webApp: 'admin',
        mode: 'local',
        revisions: ['dev'],
        endpoints: ['sls-dev-local'],
        main: 'unchanged',
      },
    ])
    expect(out.renderPlan({ plan, region: 'us-east-1' })).toBe(
      [
        'Account setup in us-east-1:',
        '  • let web apps use IAM role serverless-dev-broker-us-east-1 (adds their web functions to its trust policy)',
        'These changes will be made to 2 web apps (no CloudFormation deploy):',
        '  • web: create revisions clone and dev, and the endpoint sls-dev-fallback on the clone; main sends its traffic to the dev revision',
        '  • admin (--local-only): create a dev revision and the endpoint sls-dev-local; main is not changed',
        'What Dev Mode creates is deleted and main is moved back when you exit, or by the next serverless dev, deploy, rollback or dev restore.',
      ].join('\n'),
    )
    // Without web apps, the plan has no web changes at all.
    expect(
      out.buildPlan({
        stage: 'dev',
        deployFirst: false,
        brokerName: 'b',
        brokerExists: true,
        missingLayers: [],
        devRows: [],
      }),
    ).not.toHaveProperty('webChanges')
  })

  test('a failed stop and the idle stop say what the session restores', async () => {
    const { idleStopLine } =
      await import('../../../../../../../lib/plugins/aws/dev/attach/session-idle.js')
    expect(idleStopLine(60_000)).toBe(
      'No activity for 1m: Dev Mode stops and restores your functions (--idle-timeout).',
    )
    expect(idleStopLine(60_000, out.restoresWhat({ webApps: true }))).toBe(
      'No activity for 1m: Dev Mode stops and restores your functions and web apps (--idle-timeout).',
    )
    const scope = { stage: 'dev', region: 'us-east-1' }
    expect(out.stopFailedLine(new Error('boom'), scope)).toBe(
      'Dev Mode could not stop cleanly (boom). Run "serverless dev restore --stage dev --region us-east-1" to restore your functions.',
    )
    expect(
      out.stopFailedLine(new Error('boom'), scope, {
        functions: false,
        webApps: true,
      }),
    ).toBe(
      'Dev Mode could not stop cleanly (boom). Run "serverless dev restore --stage dev --region us-east-1" to restore your web apps.',
    )
  })

  test('a session that only a revision names is not called "unknown"', () => {
    expect(out.webAppCandidateLine({ key: 'web', owner: 'unknown' })).toBe(
      '  web  (web app)',
    )
    expect(out.webAppCandidateLine({ key: 'web', owner: 'bob@desk' })).toBe(
      '  web  (web app, bob@desk)',
    )
    expect(
      out.leftDevModeLine({
        webApp: true,
        name: 'web',
        state: 'taken_over',
        owner: 'unknown',
        you: 'alice@mbp',
      }),
    ).toBe(
      'The web app web left Dev Mode: another Dev Mode session took it over with --take-over.',
    )
    expect(
      out.lostWebAppWhy({ state: 'taken_over', owner: 'bob@desk', you: 'a' }),
    ).toBe('taken over by bob@desk (--take-over)')
    expect(out.lostWebAppWhy({ state: 'function_deleted' })).toBe(
      'its web function no longer exists',
    )
  })
})
