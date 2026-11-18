import {
  classifyWebApp,
  selectWebApps,
} from '../../../../../../../lib/plugins/aws/dev/web/eligibility.js'

const deployed = (over = {}) => ({
  functionName: 'svc-dev-web',
  mainEndpoint: 'main',
  revisionCount: 3,
  endpointCount: 1,
  ...over,
})
const classify = (over = {}) =>
  classifyWebApp({
    key: 'web',
    config: { entry: 'src/server.js' },
    deployed: deployed(),
    selection: { selected: true, localOnly: false },
    startSource: 'entry',
    context: { sessionId: 's_me', owner: 'alice@mbp', takeOver: false },
    ...over,
  })

describe('selectWebApps', () => {
  const names = ['web', 'api', 'admin']

  test('every web app is selected and relayed by default', () => {
    expect([...selectWebApps({ names }).entries()]).toEqual([
      ['web', { selected: true, localOnly: false }],
      ['api', { selected: true, localOnly: false }],
      ['admin', { selected: true, localOnly: false }],
    ])
  })

  test('--web-app selects only the named ones', () => {
    const selection = selectWebApps({ names, only: ['api'] })
    expect(selection.get('api')).toEqual({ selected: true, localOnly: false })
    expect(selection.get('web')).toEqual({
      selected: false,
      localOnly: false,
      flag: '--web-app',
    })
  })

  test('--skip-web-app leaves the named ones out', () => {
    const selection = selectWebApps({ names, skip: ['admin'] })
    expect(selection.get('admin')).toEqual({
      selected: false,
      localOnly: false,
      flag: '--skip-web-app',
    })
    expect(selection.get('web').selected).toBe(true)
  })

  test('--local-only keeps the named ones on this machine only', () => {
    const selection = selectWebApps({ names, localOnly: ['api'] })
    expect(selection.get('api')).toEqual({ selected: true, localOnly: true })
    expect(selection.get('web')).toEqual({ selected: true, localOnly: false })
  })

  test('--local-only selects a web app --web-app does not name', () => {
    const selection = selectWebApps({
      names,
      only: ['web'],
      localOnly: ['api'],
    })
    expect(selection.get('api')).toEqual({ selected: true, localOnly: true })
    expect(selection.get('admin').selected).toBe(false)
  })

  test.each([
    ['--web-app', { only: ['shop'] }],
    ['--skip-web-app', { skip: ['shop'] }],
    ['--local-only', { localOnly: ['shop'] }],
  ])('an unknown name in %s stops with the web apps listed', (_, lists) => {
    expect(() => selectWebApps({ names, ...lists })).toThrow(
      expect.objectContaining({
        code: 'DEV_MODE_UNKNOWN_WEB_APP',
        message:
          'Web app "shop" is not in this service. Web apps: web, api, admin.',
      }),
    )
  })

  test('a name in both --local-only and --skip-web-app is a conflict', () => {
    expect(() =>
      selectWebApps({ names, localOnly: ['api'], skip: ['api'] }),
    ).toThrow(
      expect.objectContaining({
        code: 'DEV_MODE_OPTION_CONFLICT',
        message: expect.stringContaining('"api"'),
      }),
    )
  })
})

describe('classifyWebApp', () => {
  test('a deployed, selected web app runs in dev', () => {
    expect(classify()).toEqual({
      webApp: 'web',
      mode: 'dev',
      notes: [],
      startSource: 'entry',
    })
  })

  test('--local-only api gives mode local', () => {
    expect(
      classify({
        key: 'api',
        selection: { selected: true, localOnly: true },
        startSource: 'config',
      }),
    ).toEqual({
      webApp: 'api',
      mode: 'local',
      notes: [],
      startSource: 'config',
    })
  })

  test.each(['--web-app', '--skip-web-app'])(
    'not_selected names %s',
    (flag) => {
      expect(
        classify({ selection: { selected: false, localOnly: false, flag } }),
      ).toEqual({
        webApp: 'web',
        mode: 'deployed',
        reason: 'not_selected',
        why: `not selected (${flag})`,
        notes: [],
      })
    },
  )

  test('not_deployed', () => {
    expect(classify({ deployed: null })).toMatchObject({
      webApp: 'web',
      mode: 'skipped',
      reason: 'not_deployed',
      why: 'not deployed yet (run serverless deploy)',
    })
  })

  test('build_output_entry when no start source applies', () => {
    expect(
      classify({
        config: { entry: '.next/standalone/server.js' },
        startSource: null,
      }),
    ).toMatchObject({
      webApp: 'web',
      mode: 'deployed',
      reason: 'build_output_entry',
      why: 'entry .next/standalone/server.js is a build output; set webApps.web.dev.command (for example: next dev)',
    })
  })

  test('build_output_entry without an entry names no entry', () => {
    expect(classify({ config: {}, startSource: null }).why).toBe(
      'the entry is a build output; set webApps.web.dev.command (for example: next dev)',
    )
  })

  test('revision_quota: a relayed web app needs 2 revisions', () => {
    expect(
      classify({ deployed: deployed({ revisionCount: 49 }) }),
    ).toMatchObject({
      mode: 'deployed',
      reason: 'revision_quota',
      why: '49 revisions, the AWS limit is 50; Dev Mode needs 2',
    })
    expect(classify({ deployed: deployed({ revisionCount: 48 }) }).mode).toBe(
      'dev',
    )
  })

  test('revision_quota: a --local-only web app needs 1 revision', () => {
    const selection = { selected: true, localOnly: true }
    expect(
      classify({ selection, deployed: deployed({ revisionCount: 49 }) }).mode,
    ).toBe('local')
    expect(
      classify({ selection, deployed: deployed({ revisionCount: 50 }) }),
    ).toMatchObject({
      mode: 'deployed',
      reason: 'revision_quota',
      why: '50 revisions, the AWS limit is 50; Dev Mode needs 1 with --local-only',
    })
  })

  test('endpoint_quota', () => {
    expect(
      classify({ deployed: deployed({ endpointCount: 10 }) }),
    ).toMatchObject({
      mode: 'deployed',
      reason: 'endpoint_quota',
      why: '10 endpoints, the AWS limit is 10; Dev Mode needs 1',
    })
    expect(classify({ deployed: deployed({ endpointCount: 9 }) }).mode).toBe(
      'dev',
    )
  })

  test('the quotas leave out the revisions and endpoints of the session the attach removes first', () => {
    // A session that has ended left a clone, a dev revision and sls-dev-fallback: 47 + 2 + 2 fit.
    const left = deployed({
      sessionId: 's_old',
      owner: 'alice@mbp',
      revisionCount: 49,
      endpointCount: 10,
      leftRevisionCount: 2,
      leftEndpointCount: 1,
    })
    const gone = new Map([['s_old', 'gone']])
    expect(
      classify({
        deployed: left,
        context: { sessionId: 's_me', owner: 'alice@mbp', liveness: gone },
      }).mode,
    ).toBe('dev')
    // A running session taken over is removed first too.
    const running = new Map([['s_old', 'live']])
    expect(
      classify({
        deployed: left,
        context: {
          sessionId: 's_me',
          owner: 'alice@mbp',
          liveness: running,
          takeOver: true,
        },
      }).mode,
    ).toBe('dev')
    // Not taken over, it stays: the web app is skipped, not counted.
    expect(
      classify({
        deployed: left,
        context: { sessionId: 's_me', owner: 'alice@mbp', liveness: running },
      }).reason,
    ).toBe('owned_by_other_session')
    // What stays is still counted, and the reason names it.
    expect(
      classify({
        deployed: deployed({
          ...left,
          revisionCount: 51,
          endpointCount: 11,
        }),
        context: { sessionId: 's_me', owner: 'alice@mbp', liveness: gone },
      }),
    ).toMatchObject({
      reason: 'revision_quota',
      why: '49 revisions, the AWS limit is 50; Dev Mode needs 2',
    })
    expect(
      classify({
        deployed: deployed({ ...left, endpointCount: 11 }),
        context: { sessionId: 's_me', owner: 'alice@mbp', liveness: gone },
      }),
    ).toMatchObject({
      reason: 'endpoint_quota',
      why: '10 endpoints, the AWS limit is 10; Dev Mode needs 1',
    })
  })

  test('unknown counts are not checked', () => {
    expect(
      classify({
        deployed: deployed({
          revisionCount: undefined,
          endpointCount: undefined,
        }),
      }).mode,
    ).toBe('dev')
  })

  test('owned_by_other_session: another session of yours that answers', () => {
    expect(
      classify({
        deployed: deployed({ sessionId: 's_other', owner: 'alice@mbp' }),
        context: {
          sessionId: 's_me',
          owner: 'alice@mbp',
          liveness: new Map([['s_other', 'live']]),
        },
      }),
    ).toMatchObject({
      webApp: 'web',
      mode: 'skipped',
      reason: 'owned_by_other_session',
      why: 'in Dev Mode in another session of yours (--take-over to take it)',
    })
  })

  test("owned_by_other_session: another developer's session", () => {
    expect(
      classify({
        deployed: deployed({ sessionId: 's_bob', owner: 'bob@mbp' }),
      }),
    ).toMatchObject({
      mode: 'skipped',
      reason: 'owned_by_other_session',
      why: 'in Dev Mode for bob@mbp (--take-over to take it)',
    })
  })

  test('--take-over takes it, with a note', () => {
    expect(
      classify({
        deployed: deployed({ sessionId: 's_bob', owner: 'bob@mbp' }),
        context: { sessionId: 's_me', owner: 'alice@mbp', takeOver: true },
      }),
    ).toMatchObject({
      mode: 'dev',
      notes: [{ reason: 'taken_over', message: 'taken over from bob@mbp' }],
    })
  })

  test('a session that is gone holds nothing', () => {
    expect(
      classify({
        deployed: deployed({ sessionId: 's_old', owner: 'alice@mbp' }),
        context: {
          sessionId: 's_me',
          owner: 'alice@mbp',
          liveness: new Map([['s_old', 'gone']]),
        },
      }),
    ).toMatchObject({
      mode: 'dev',
      notes: [
        {
          reason: 'reattached',
          message: 'left in Dev Mode by an earlier session of yours',
        },
      ],
    })
  })

  test('a session only its revision names (owner unknown) is not named "unknown"', () => {
    const orphan = deployed({ sessionId: 's_cut', owner: 'unknown' })
    // It has ended: taken over from it, as from any session that has ended.
    expect(
      classify({
        deployed: orphan,
        context: {
          sessionId: 's_me',
          owner: 'alice@mbp',
          liveness: new Map([['s_cut', 'gone']]),
        },
      }).notes,
    ).toEqual([
      {
        reason: 'taken_over',
        message: 'taken over from a session that has ended',
      },
    ])
    // It runs: held by another session, then taken with --take-over.
    const running = new Map([['s_cut', 'live']])
    expect(
      classify({
        deployed: orphan,
        context: { sessionId: 's_me', owner: 'alice@mbp', liveness: running },
      }).why,
    ).toBe('in Dev Mode in another session (--take-over to take it)')
    expect(
      classify({
        deployed: orphan,
        context: {
          sessionId: 's_me',
          owner: 'alice@mbp',
          liveness: running,
          takeOver: true,
        },
      }).notes,
    ).toEqual([
      { reason: 'taken_over', message: 'taken over from another session' },
    ])
  })

  test('this session owning it is not another session', () => {
    expect(
      classify({
        deployed: deployed({ sessionId: 's_me', owner: 'alice@mbp' }),
      }).mode,
    ).toBe('dev')
  })
})
