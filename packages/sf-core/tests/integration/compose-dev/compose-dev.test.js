import fs from 'fs'
import path from 'path'
import url from 'url'
import { spawn } from 'child_process'
import { setGlobalRendererSettings } from '@serverless/util'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { fetchWithRetry } from '../../utils/testUtils.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const SF_CORE_BIN = path.resolve(__dirname, '../../../bin/sf-core.js')

jest.setTimeout(900000)

/**
 * Pull the live HTTP endpoint out of the dev-mode output.
 *
 * The dev runner prints an "Endpoints:" block (see `logOutputs` in
 * plugins/aws/dev/index.js). A single httpApi endpoint can appear either as a
 * "GET - https://..." line or as a bare execute-api URL, so accept both and
 * make sure the resolved URL carries the route path (`/hello`).
 */
const extractEndpoint = (output, routePath) => {
  const methodMatch = output.match(
    /(?:GET|ANY|POST|PUT|PATCH|DELETE)\s*-\s*(https:\/\/\S+)/,
  )
  const bareMatch = output.match(/(https:\/\/[^\s"']+execute-api[^\s"']*)/)
  const raw = (methodMatch && methodMatch[1]) || (bareMatch && bareMatch[1])
  if (!raw) return null
  const base = raw.replace(/\/+$/, '')
  return base.endsWith(routePath) ? base : `${base}${routePath}`
}

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
  let devProcess
  let devOutput = ''

  beforeAll(async () => {
    // Capture cwd before anything that can throw, so afterAll's restore never
    // runs with `undefined` and masks the real setup error.
    originalCwd = process.cwd()
    // The dev command copies the pre-built dev-mode shim into the deployed
    // function; it is a gitignored build artifact, so fresh checkouts/worktrees
    // don't have it and `dev` fails at startup with BUILD_SHIM_FAILED.
    const shimPath = path.resolve(
      __dirname,
      '../../../../serverless/lib/plugins/aws/dev/shim.min.js',
    )
    if (!fs.existsSync(shimPath)) {
      throw new Error(
        `Dev-mode shim not built: ${shimPath} is missing. Build it once with 'npm run build:devmode:shim' in packages/serverless before running this test.`,
      )
    }
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
  })

  afterAll(async () => {
    if (devProcess && !devProcess.killed && devProcess.exitCode === null) {
      devProcess.kill('SIGINT')
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          try {
            devProcess.kill('SIGKILL')
          } catch {
            // already gone
          }
          resolve()
        }, 15000)
        devProcess.on('exit', () => {
          clearTimeout(t)
          resolve()
        })
      })
    }
    // Teardown: personal-stage services (api self-provisioned by dev, plus
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

  test('serverless api dev at the personal stage connects and serves local code with both params', async () => {
    // The dev command is long-running, so it cannot be hosted by the in-process
    // runSfCore helper — spawn the CLI directly. stdio:'pipe' (no TTY) keeps the
    // dev-mode spinner from animating and flooding output.
    devProcess = spawn(
      process.execPath,
      [SF_CORE_BIN, 'api', 'dev', '--stage', personalStage],
      { cwd: configFileDirPath, env: { ...process.env }, stdio: 'pipe' },
    )

    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`dev did not connect. Output:\n${devOutput}`)),
        600000,
      )
      const onData = (chunk) => {
        devOutput += chunk.toString()
        // The endpoint block is printed before the "Connected" line; only
        // resolve once both are present so the local shim is actually wired.
        if (/Connected/.test(devOutput)) {
          const endpoint = extractEndpoint(devOutput, routePath)
          if (endpoint) {
            clearTimeout(timer)
            resolve(endpoint)
          }
        }
      }
      devProcess.stdout.on('data', onData)
      devProcess.stderr.on('data', onData)
      devProcess.on('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`dev exited early (${code}). Output:\n${devOutput}`))
      })
      devProcess.on('error', (err) => {
        clearTimeout(timer)
        reject(
          new Error(
            `dev failed to spawn: ${err.message}\nOutput:\n${devOutput}`,
          ),
        )
      })
    })

    try {
      const response = await fetchWithRetry(endpoint)
      const body = await response.json()

      expect(body.marker).toEqual('local-dev-mode-code')
      // graph param resolved at the personal stage
      expect(body.localTopicArn).toContain(
        `compose-devtest-localdep-${personalStage}`,
      )
      // hoisted stage-mapped aws:cf resolved at the shared stage
      expect(body.sharedTopicArn).toContain(
        `compose-devtest-shared-${sharedStage}`,
      )
    } catch (err) {
      // Capture everything before afterAll tears the stacks down.
      console.error('=== dev-mode child output ===')
      console.error(devOutput)
      console.error('=== assertion failure ===', err.message)
      throw err
    }
  })
})
