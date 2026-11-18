import { jest } from '@jest/globals'
import { execFile } from 'child_process'
import { mkdtemp, realpath, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'util'

// Spawns the REAL bin in a service whose JS configuration file exports a
// promise that never settles, so the command waits on an operation that can
// never finish and Node.js runs out of work. The configuration file is read
// before sign-in, so this needs no credentials and no network. Without the
// stall guard wired into the bin, Node.js would exit with code 0 and print
// nothing.
const run = promisify(execFile)
const BIN = fileURLToPath(new URL('../../../bin/sf-core.js', import.meta.url))
const tmp = async (prefix) =>
  realpath(await mkdtemp(path.join(tmpdir(), prefix)))

describe('a command that stalls (spawned bin)', () => {
  jest.setTimeout(60000)

  it('exits with code 1 and says the command stopped before it finished', async () => {
    const home = await tmp('stall-home-')
    const dir = await tmp('stall-svc-')
    await writeFile(
      path.join(dir, 'serverless.mjs'),
      'export default new Promise(() => {})\n',
    )

    const result = await run(process.execPath, [BIN, 'print'], {
      cwd: dir,
      env: {
        ...process.env,
        HOME: home,
        // os.homedir() reads USERPROFILE on Windows, not HOME.
        USERPROFILE: home,
        SERVERLESS_PLATFORM_STAGE: 'dev',
        SERVERLESS_LICENSE_KEY: '',
        SERVERLESS_ACCESS_KEY: '',
        AWS_ACCESS_KEY_ID: '',
        AWS_SECRET_ACCESS_KEY: '',
        AWS_PROFILE: '',
      },
      timeout: 30000,
    }).then(
      ({ stderr }) => ({ code: 0, stderr }),
      (error) => ({ code: error.code, stderr: error.stderr }),
    )

    expect(result.stderr).toContain('The command stopped before it finished')
    expect(result.code).toBe(1)
  })
})
