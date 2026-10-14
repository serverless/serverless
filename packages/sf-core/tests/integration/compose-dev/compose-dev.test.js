import path from 'path'
import url from 'url'
import { setGlobalRendererSettings } from '@serverless/util'
import { jest } from '@jest/globals'
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { GetFunctionCommand, LambdaClient } from '@aws-sdk/client-lambda'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { fetchWithRetry } from '../../utils/testUtils.js'
import {
  assertDevModeLayersBuilt,
  cleanupDevModeAccountResources,
  newDevModeTestSuffix,
  spawnSourceCli,
  waitForOutput,
} from '../../utils/devMode.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

jest.setTimeout(900000)

describe('Compose single-service dev with Pattern D params', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const routePath = '/hello'
  const originalEnv = { ...process.env }
  const originalArgv = [...process.argv]
  let originalCwd
  const sharedStage = getTestStageName() // stands in for the shared "dev" data stage
  // Prefix (not suffix) so neither stage name is a substring of the other —
  // otherwise a wrongly-resolved hoisted `aws:cf` param at the personal stage
  // could still satisfy a `toContain` assertion meant to pin the shared stage.
  const personalStage = `p${sharedStage}` // the developer's personal stage
  // Suffixes the account-level Dev Mode names (broker role, layers), so this suite can delete
  // exactly what it created.
  const suffix = newDevModeTestSuffix()
  let devProcess

  beforeAll(async () => {
    // Capture cwd before anything that can throw, so afterAll's restore never
    // runs with `undefined` and masks the real setup error.
    originalCwd = process.cwd()
    // The Dev Mode layer zips are gitignored build artifacts: fresh checkouts and worktrees
    // don't have them, and `dev` cannot attach without them.
    assertDevModeLayersBuilt()
    process.chdir(configFileDirPath)
    setGlobalRendererSettings({ isInteractive: false, logLevel: 'error' })
    // Mutate process.env in place. Reassigning it (process.env = {...}) does not
    // reliably propagate to the native environment child processes inherit, and
    // assigning `undefined` to a key stringifies it to "undefined" (truthy).
    process.env.SERVERLESS_PLATFORM_STAGE = 'dev'
    if (process.env.SERVERLESS_LICENSE_KEY_DEV) {
      process.env.SERVERLESS_LICENSE_KEY =
        process.env.SERVERLESS_LICENSE_KEY_DEV
    }
    delete process.env.SERVERLESS_ACCESS_KEY
    process.env.COMPOSE_DEV_SHARED_STAGE = sharedStage
    process.env.SLS_DEV_TEST_SUFFIX = suffix
  })

  afterAll(async () => {
    if (devProcess && devProcess.exitCode === null && !devProcess.signalCode) {
      // Exit restores the attached function, so give it time before forcing.
      devProcess.kill('SIGINT')
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          try {
            devProcess.kill('SIGKILL')
          } catch {
            // already gone
          }
          resolve()
        }, 30000)
        devProcess.exited.then(() => {
          clearTimeout(t)
          resolve()
        })
      })
    }
    // Teardown: personal-stage services (api deployed by dev, plus
    // localdep), then the shared one.
    for (const [service, stage] of [
      ['api', personalStage],
      ['localdep', personalStage],
      ['shared', sharedStage],
    ]) {
      process.argv[2] = 'remove'
      try {
        await runSfCore({
          coreParams: { options: { stage, service }, command: ['remove'] },
          jest,
        })
      } catch (err) {
        // best-effort teardown; surface but don't mask the test result
        console.error(`teardown of ${service}@${stage} failed:`, err.message)
      }
    }
    const left = await cleanupDevModeAccountResources({
      region: 'us-east-1',
      suffix,
    }).catch((error) => [error.message])
    if (left.length) console.error('Dev Mode test resources left behind:', left)
    // Restore cwd first: jest workers run several test files in one process,
    // so a leaked chdir makes later, unrelated test files resolve THIS
    // fixture's serverless-compose.yml (whose ${env:COMPOSE_DEV_SHARED_STAGE}
    // is gone after the env restore below) from their own runs.
    process.chdir(originalCwd)
    // Restore the environment by mutating in place (see beforeAll).
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
    // Restore argv too — later test files in the same jest worker must not
    // inherit this suite's last process.argv[2] mutation.
    process.argv.splice(0, process.argv.length, ...originalArgv)
  })

  test('deploy the shared service at the shared stage and localdep at the personal stage', async () => {
    process.argv[2] = 'deploy'
    await runSfCore({
      coreParams: {
        options: { stage: sharedStage, service: 'shared' },
        command: ['deploy'],
      },
      jest,
    })
    await runSfCore({
      coreParams: {
        options: { stage: personalStage, service: 'localdep' },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('serverless api dev at an undeployed personal stage deploys it, attaches it, and restores it when the session ends', async () => {
    // `dev` is long-running, so it runs as a child process over pipes rather than in-process.
    devProcess = spawnSourceCli({
      args: ['api', 'dev', '--stage', personalStage],
      cwd: configFileDirPath,
      env: { SLS_DEV_TEST_SUFFIX: suffix },
    })
    await waitForOutput(devProcess, /Dev Mode on/)
    const region = 'us-east-1'
    const stackName = `compose-devtest-api-${personalStage}`
    const lambda = new LambdaClient({ region })
    const functionName = `${stackName}-hello`
    try {
      // The stage was never deployed: dev deploys it first, as a normal deployment.
      expect(devProcess.output).toContain(
        `Stage "${personalStage}" is not deployed yet: deploying it first.`,
      )
      expect(devProcess.output).toMatch(
        new RegExp(`Service deployed to stack ${stackName}\\b.*\\(\\d+s\\)`),
      )
      const { Stacks } = await new CloudFormationClient({ region }).send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      const apiUrl = Stacks[0].Outputs.find(
        (output) => output.OutputKey === 'HttpApiUrl',
      ).OutputValue
      // Invocations are not relayed to this machine yet: the deployed code answers, with both
      // params resolved.
      const body = await (await fetchWithRetry(`${apiUrl}${routePath}`)).json()
      expect(body.marker).toEqual('working-copy-code')
      // graph param resolved at the personal stage
      expect(body.localTopicArn).toContain(
        `compose-devtest-localdep-${personalStage}`,
      )
      // hoisted stage-mapped aws:cf resolved at the shared stage
      expect(body.sharedTopicArn).toContain(
        `compose-devtest-shared-${sharedStage}`,
      )
      const attached = (
        await lambda.send(
          new GetFunctionCommand({ FunctionName: functionName }),
        )
      ).Configuration
      expect(attached.Environment.Variables.AWS_LAMBDA_EXEC_WRAPPER).toBe(
        '/opt/sls-dev-wrapper',
      )
    } catch (err) {
      // Capture everything before afterAll tears the stacks down.
      console.error('=== dev-mode child output ===')
      console.error(devProcess.output)
      throw err
    }
    if (process.platform === 'win32') {
      // Windows has no signals one process can send another: Node's kill() ends the child at
      // once, as a crash would, so the session cannot restore and `dev restore` puts the function
      // back. (Ctrl+C typed into the console, or closing it, does reach the session there.)
      devProcess.kill('SIGKILL')
      await devProcess.exited
      const left = (
        await lambda.send(
          new GetFunctionCommand({ FunctionName: functionName }),
        )
      ).Configuration
      expect(left.Environment.Variables.AWS_LAMBDA_EXEC_WRAPPER).toBe(
        '/opt/sls-dev-wrapper',
      )
      const restore = spawnSourceCli({
        args: ['api', 'dev', 'restore', '--stage', personalStage],
        cwd: configFileDirPath,
        env: { SLS_DEV_TEST_SUFFIX: suffix },
      })
      const { code } = await restore.exited
      await restore.closed
      if (code !== 0) console.error(restore.output)
      expect(code).toBe(0)
    } else {
      devProcess.kill('SIGINT')
      expect((await devProcess.exited).code).toBe(0)
    }
    const restored = (
      await lambda.send(new GetFunctionCommand({ FunctionName: functionName }))
    ).Configuration
    expect(
      restored.Environment.Variables.AWS_LAMBDA_EXEC_WRAPPER,
    ).toBeUndefined()
    expect(restored.Layers ?? []).toEqual([])
    expect(restored.Environment.Variables.LOCAL_TOPIC_ARN).toContain(
      `compose-devtest-localdep-${personalStage}`,
    )
  })
})
