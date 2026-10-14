import { afterEach, describe, expect, test } from '@jest/globals'
import path from 'path'
import {
  cliCommand,
  commandFor,
  resetCliNames,
  setCliNames,
  shellWord,
  shownPath,
} from '../../../../../../../lib/plugins/aws/dev/commands/cli-names.js'
import {
  restoreCommand,
  restoreNext,
} from '../../../../../../../lib/plugins/aws/dev/commands/envelope.js'
import * as out from '../../../../../../../lib/plugins/aws/dev/attach/output.js'

afterEach(() => resetCliNames())

const ROOT = path.resolve('/projects/shop')
const composeService = (serviceName = 'consumer') => ({
  serviceDir: path.join(ROOT, serviceName),
  compose: { isWithinCompose: true, serviceName },
})

describe('commands and files as Dev Mode prints them', () => {
  test('in a service directory: plain commands and paths under .serverless/dev', () => {
    setCliNames({
      serverless: { serviceDir: ROOT, compose: { isWithinCompose: false } },
      cwd: ROOT,
    })
    expect(cliCommand('dev wait --for ready')).toBe(
      'serverless dev wait --for ready',
    )
    expect(shownPath('.serverless/dev/session.log')).toBe(
      '.serverless/dev/session.log',
    )
  })

  test('from a Compose root: every command names the service, every path its folder', () => {
    setCliNames({ serverless: composeService(), cwd: ROOT })
    expect(cliCommand('dev wait --for invocation')).toBe(
      'serverless consumer dev wait --for invocation',
    )
    expect(shownPath('.serverless/dev/session.ndjson')).toBe(
      'consumer/.serverless/dev/session.ndjson',
    )
    expect(restoreCommand({ stage: 'nscxd', region: 'us-east-1' })).toBe(
      'serverless consumer dev restore --stage nscxd --region us-east-1',
    )
    expect(restoreNext({ stage: 'nscxd' }).command).toBe(
      'serverless consumer dev restore --stage nscxd',
    )
    expect(out.SESSION_RUNNING_NEXT.command).toBe(
      'serverless consumer dev stop',
    )
    expect(out.sessionRunningLine({ stage: 'a', pid: 1 })).toContain(
      '"serverless consumer dev stop"',
    )
  })

  test('a service run through Compose from its own folder keeps plain paths', () => {
    setCliNames({
      serverless: composeService(),
      cwd: path.join(ROOT, 'consumer'),
    })
    expect(cliCommand('dev stop')).toBe('serverless consumer dev stop')
    expect(shownPath('.serverless/dev/session.log')).toBe(
      '.serverless/dev/session.log',
    )
  })

  test('a service name a shell would split is quoted', () => {
    expect(shellWord('plain-name_1.2')).toBe('plain-name_1.2')
    expect(shellWord('two words')).toBe("'two words'")
    setCliNames({ serverless: composeService('my svc'), cwd: ROOT })
    expect(cliCommand('dev stop')).toBe("serverless 'my svc' dev stop")
  })
})

describe('paths from a Compose root, in results and lines alike', () => {
  test('dev requests names each file from the root', async () => {
    const fs = await import('fs')
    const os = await import('os')
    const { runDevRequests } =
      await import('../../../../../../../lib/plugins/aws/dev/commands/requests.js')
    const service = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    try {
      const dir = path.join(service, '.serverless', 'dev', 'invocations', 'api')
      fs.mkdirSync(dir, { recursive: true })
      const id = '3f2a9c1e-0000-4000-8000-00000000000b'
      fs.writeFileSync(
        path.join(dir, `1759661067-${id}.json`),
        JSON.stringify({
          v: 1,
          request_id: id,
          function: 'api',
          stage: 'nscxd',
          started_at: '2025-10-05T10:44:27.000Z',
          duration_ms: 3,
          outcome: 'ok',
        }),
      )
      setCliNames({
        serverless: {
          serviceDir: service,
          compose: { isWithinCompose: true, serviceName: 'consumer' },
        },
        cwd: path.dirname(service),
      })
      const { result, human } = await runDevRequests({
        serviceDir: service,
        options: {},
        deps: { connect: async () => null },
      })
      const file = `${path.basename(service)}/.serverless/dev/invocations/api/1759661067-${id}.json`
      expect(result.requests[0].file).toBe(file)
      expect(human).toContain(file)
    } finally {
      fs.rmSync(service, { recursive: true, force: true })
    }
  })
})

describe('folders and config files', () => {
  test('a service folder outside the directory the CLI runs in keeps its way there', () => {
    setCliNames({
      serverless: composeService('../shared/consumer'),
      cwd: ROOT,
    })
    expect(shownPath('.serverless/dev/session.log')).toBe(
      '../shared/consumer/.serverless/dev/session.log',
    )
    setCliNames({ serverless: composeService('..cache'), cwd: ROOT })
    expect(shownPath('.serverless/dev/session.log')).toBe(
      '..cache/.serverless/dev/session.log',
    )
  })

  test('a --config the command was given goes with every suggested command', () => {
    setCliNames({
      serverless: {
        serviceDir: path.join(ROOT, 'sub'),
        compose: { isWithinCompose: false },
      },
      options: { config: 'sub/serverless.yml' },
      cwd: ROOT,
    })
    expect(cliCommand('dev stop')).toBe(
      'serverless dev stop --config sub/serverless.yml',
    )
    setCliNames({
      serverless: {
        ...composeService(),
        compose: {
          isWithinCompose: true,
          serviceName: 'consumer',
          configFile: 'compose/shop.yml',
        },
      },
      options: {},
      cwd: ROOT,
    })
    expect(cliCommand('dev stop')).toBe(
      'serverless consumer dev stop --config compose/shop.yml',
    )
  })

  test('a restore a Dev Mode command suggests carries its --config', () => {
    setCliNames({
      serverless: { serviceDir: path.join(ROOT, 'sub') },
      options: { config: 'sub/serverless.yml' },
      cwd: ROOT,
    })
    expect(restoreCommand({ stage: 'dev', region: 'us-east-1' })).toBe(
      'serverless dev restore --stage dev --region us-east-1 --config sub/serverless.yml',
    )
  })

  test('a restore suggested by deploy, remove or rollback in a Compose run names its service', () => {
    expect(
      restoreCommand({
        stage: 'nscxd',
        region: 'us-east-1',
        compose_service: 'consumer',
      }),
    ).toBe('serverless consumer dev restore --stage nscxd --region us-east-1')
    expect(restoreCommand({ stage: 'nscxd', compose_service: null })).toBe(
      'serverless dev restore --stage nscxd',
    )
  })

  test('one formatter names a service in every command', () => {
    expect(commandFor('consumer', 'dev stop')).toBe(
      'serverless consumer dev stop',
    )
    expect(commandFor(null, 'dev stop')).toBe('serverless dev stop')
    expect(commandFor('my svc', 'deploy')).toBe("serverless 'my svc' deploy")
  })
})

describe('commands an administrator runs', () => {
  test('dev setup is suggested as it runs outside any project, with the region', async () => {
    const { brokerSetupHint } =
      await import('../../../../../../../lib/plugins/aws/dev/attach/broker.js')
    setCliNames({ serverless: composeService(), cwd: ROOT })
    expect(brokerSetupHint('eu-west-1')).toBe(
      'Ask an administrator to run "serverless dev setup --region eu-west-1" once (it accepts --permissions-boundary and --path when your organization requires them).',
    )
  })
})
