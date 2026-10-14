// Importing router.js first resolves a pre-existing circular-import ordering
// issue (compose.js -> ./index.js -> router.js -> compose.js): when compose.js
// is the module graph's entry point, router.js's top-level `ComposeRunner`
// reference gets evaluated before compose.js finishes defining it. This
// side-effect import forces the safe evaluation order without altering the
// module under test.
import '../../../../../src/lib/router.js'
import { jest } from '@jest/globals'
import { runCompose } from '../../../../../src/lib/runners/compose/compose.js'
import { parseComposeGraph } from '../../../../../src/lib/runners/compose/index.js'

// runCompose validates the command BEFORE building the graph or touching the
// state store, so these tests need no resolverManager beyond a stub.
const runComposeArgs = (command, options = {}) => ({
  composeConfigFile: {
    services: { api: { path: 'api' }, worker: { path: 'worker' } },
  },
  composeDirPath: '/tmp/compose-teaching-test',
  versions: {},
  command,
  options,
  resolverManager: { getResolverProviders: () => ({}), params: {} },
})

describe('compose teaching errors', () => {
  test('project-level dev lists per-service dev commands', async () => {
    await expect(runCompose(runComposeArgs(['dev']))).rejects.toThrow(
      /runs on one service at a time[\s\S]*serverless api dev[\s\S]*serverless worker dev/,
    )
  })

  test('project-level dev suggests the per-service commands with the options given', async () => {
    const error = await runCompose(
      runComposeArgs(['dev'], { stage: 'nscxd', region: 'us-east-1' }),
    ).catch((caught) => caught)
    expect(error.message).toBe(
      'In a Compose project, "dev" runs on one service at a time. Start it for a specific service:\n' +
        '  serverless api dev --stage nscxd --region us-east-1\n' +
        '  serverless worker dev --stage nscxd --region us-east-1',
    )
  })

  test('the suggested commands carry only the scope options, values quoted only when needed', async () => {
    const error = await runCompose(
      runComposeArgs(['dev'], {
        s: 'my stage',
        r: 'eu-west-1',
        'aws-profile': 'dev-profile',
        c: 'serverless-compose.yml',
        f: ['a', 'b'],
        'take-over': true,
        detach: false,
        debug: '*',
      }),
    ).catch((caught) => caught)
    expect(error.message).toContain(
      "  serverless api dev -s 'my stage' -r eu-west-1 --aws-profile dev-profile -c serverless-compose.yml\n",
    )
  })

  test('no other option value reaches the message, which the error event carries', async () => {
    const SECRET = 'dbPassword=hunter2-secret'
    for (const options of [
      { param: SECRET, stage: 'ci' },
      { param: [SECRET, 'other=value'], 'aws-profile': 'ci' },
      { 'some-plugin-token': 'tok_secret_123', region: 'us-east-1' },
    ]) {
      const error = await runCompose(runComposeArgs(['dev'], options)).catch(
        (caught) => caught,
      )
      expect(error.message).toMatch(
        /serverless api dev --(stage|aws-profile|region) /,
      )
      expect(error.message).not.toContain('hunter2')
      expect(error.message).not.toContain('other=value')
      expect(error.message).not.toContain('tok_secret_123')
      expect(error.message).not.toContain('--param')
    }
  })

  test('unsupported project-level command names supported commands and the per-service form', async () => {
    await expect(runCompose(runComposeArgs(['logs']))).rejects.toThrow(
      /Project-wide commands: deploy, info, remove, print, package[\s\S]*serverless <service> logs/,
    )
  })

  test('a refused project-level command names only its own words, never a positional value', async () => {
    const ID = '3f2a9c1e-0000-4000-8000-00000000000b'
    for (const command of [
      ['dev', 'replay', ID, 'my-secret-word'],
      ['nope', 'dev', 'replay', ID],
    ]) {
      const error = await runCompose(runComposeArgs(command)).catch(
        (caught) => caught,
      )
      expect(error).toBeInstanceOf(Error)
      expect(error.message).not.toContain(ID)
      expect(error.message).not.toContain('my-secret-word')
    }
    const atRoot = await runCompose(
      runComposeArgs(['dev', 'replay', ID]),
    ).catch((caught) => caught)
    expect(atRoot.message).toContain('The command "dev replay" is not')
    expect(atRoot.message).toContain('serverless <service> dev replay.')
    const noService = await runCompose(
      runComposeArgs(['nope', 'dev', 'replay', ID]),
    ).catch((caught) => caught)
    expect(noService.message).toBe(
      'The service nope does not exist in the Compose configuration.',
    )
  })

  test('a --service refusal never names a positional value', async () => {
    const ID = '3f2a9c1e-0000-4000-8000-00000000000b'
    const command = () => ['dev', 'replay', ID, 'my-secret-word']
    const empty = await runCompose(
      runComposeArgs(command(), { service: ',' }),
    ).catch((caught) => caught)
    expect(empty.message).toBe(
      'No services were resolved from --service. Provide a comma-separated list of service names, e.g.: serverless dev replay --service=<service-a>,<service-b>.',
    )
    const list = await runCompose(
      runComposeArgs(command(), { service: 'api,worker' }),
    ).catch((caught) => caught)
    expect(list.message).toBe(
      'The command "dev replay" runs on one service at a time and cannot be used with a service list. Run it for a single service, e.g.: serverless api dev replay.',
    )
    for (const error of [empty, list]) {
      expect(error.message).not.toContain(ID)
      expect(error.message).not.toContain('my-secret-word')
    }
  })

  test('a --service value that resolves to no names is rejected, not run whole-graph', async () => {
    // `--service=,` / `--service=" "` are malformed: they must not silently
    // fall through to a whole-graph run.
    for (const service of [',', ' ', ' , ']) {
      await expect(
        runCompose(runComposeArgs(['deploy'], { service })),
      ).rejects.toThrow(/No services were resolved from --service/)
    }
  })

  test('the get-state read pass never throws on missing dependency state (no exit-code pollution)', async () => {
    // The get-state pass WARMS the state params resolve from — a missing
    // dependency state there is expected (not deployed yet), never a failure.
    // Before this guard, the pass threw COMPOSE_COULD_NOT_RESOLVE_PARAM for an
    // unresolvable param, printing a spurious ✖ and setting exit code 1 on
    // otherwise-successful subset runs (I1).
    const compose = await parseComposeGraph({
      servicePath: '/tmp/compose-teaching-test',
      configuration: {
        services: {
          worker: { path: 'worker' },
          api: { path: 'api', params: { queueUrl: '${worker.QueueOut}' } },
        },
      },
      versions: {},
      runStage: 'alice',
    })
    const originalExitCode = process.exitCode
    const runnerFunction = jest.fn(async () => ({}))
    try {
      await expect(
        compose.executeComponentsGraph({
          command: ['get-state'],
          reverse: false,
          composeOrgName: 'test-org',
          options: { stage: 'alice' },
          resolverProviders: {},
          params: {},
          runnerFunction,
          state: { localState: {} },
          isMultipleComponents: false,
        }),
      ).resolves.not.toThrow()
      // api's unresolvable param is passed through as the '' placeholder so the
      // read can proceed; the real command's own pass still fails loudly later.
      const apiCall = runnerFunction.mock.calls.find(
        ([{ compose: c }]) => c.serviceName === 'api',
      )
      expect(apiCall[0].compose.params.queueUrl).toEqual('')
      expect(process.exitCode).toEqual(originalExitCode)
    } finally {
      process.exitCode = originalExitCode
    }
  })

  test('unresolved compose param names the exact deploy command with stage', async () => {
    const compose = await parseComposeGraph({
      servicePath: '/tmp/compose-teaching-test',
      configuration: {
        services: {
          worker: { path: 'worker' },
          api: { path: 'api', params: { queueUrl: '${worker.QueueOut}' } },
        },
      },
      versions: {},
      runStage: 'alice',
    })
    // Stub runner so the worker "runs" without producing state; api's param
    // lookup against empty localState must then throw the teaching message.
    const runnerFunction = jest.fn(async () => ({}))
    await expect(
      compose.executeComponentsGraph({
        command: ['deploy'],
        reverse: false,
        composeOrgName: 'test-org',
        options: { stage: 'alice' },
        resolverProviders: {},
        params: {},
        runnerFunction,
        state: { localState: {} },
        isMultipleComponents: false, // single-mode: error is rethrown, not swallowed into the report
      }),
    ).rejects.toThrow(
      /Could not resolve[\s\S]*'queueUrl'[\s\S]*serverless deploy --service=worker --stage alice/,
    )
  })

  test('wrong output KEY (state present) names the bad output and lists available ones, not "deploy it first"', async () => {
    // worker IS deployed and its state IS present, but api references a typo'd
    // output name. The error must point at the output name, not tell the user to
    // (re)deploy a service that is already there.
    const compose = await parseComposeGraph({
      servicePath: '/tmp/compose-teaching-test',
      configuration: {
        services: {
          worker: { path: 'worker' },
          api: { path: 'api', params: { queueUrl: '${worker.WrongKey}' } },
        },
      },
      versions: {},
      runStage: 'alice',
    })
    // worker "runs" and reports a DIFFERENT output key, so localState.worker ends
    // up present with outputs { RightKey } before api's param lookup runs.
    const runnerFunction = jest.fn(async () => ({
      state: { outputs: { RightKey: 'v' } },
    }))
    let thrown
    try {
      await compose.executeComponentsGraph({
        command: ['deploy'],
        reverse: false,
        composeOrgName: 'test-org',
        options: { stage: 'alice' },
        resolverProviders: {},
        params: {},
        runnerFunction,
        state: { localState: {} },
        isMultipleComponents: false,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeDefined()
    expect(thrown.message).toContain("has no output 'WrongKey'")
    expect(thrown.message).toContain('Available outputs: RightKey')
    expect(thrown.message).not.toMatch(/deploy it first/i)
  })

  test('literal (hoisted, pre-resolved) params pass straight through to the service', async () => {
    // A hoisted `${aws:cf:...}` param is already a literal string by the time
    // the graph runs (compose-file variables resolve at startup) — pin the
    // literal pass-through branch of compose param resolution (the `else`
    // that copies non-graph params verbatim).
    const compose = await parseComposeGraph({
      servicePath: '/tmp/compose-teaching-test',
      configuration: {
        services: {
          api: {
            path: 'api',
            params: { sharedArn: 'arn:aws:sns:us-east-1:123:shared-dev-Topic' },
          },
        },
      },
      versions: {},
      runStage: 'dev',
    })
    const runnerFunction = jest.fn(async () => ({}))
    await compose.executeComponentsGraph({
      command: ['deploy'],
      reverse: false,
      composeOrgName: 'test-org',
      options: {},
      resolverProviders: {},
      params: {},
      runnerFunction,
      state: { localState: {} },
      isMultipleComponents: false,
    })
    expect(runnerFunction).toHaveBeenCalledTimes(1)
    expect(runnerFunction.mock.calls[0][0].compose.params.sharedArn).toEqual(
      'arn:aws:sns:us-east-1:123:shared-dev-Topic',
    )
  })
})
