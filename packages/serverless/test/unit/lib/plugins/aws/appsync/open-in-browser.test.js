import childProcess from 'node:child_process'
import { jest } from '@jest/globals'

const API_ID = 'abc123xyz'

// Reads a PowerShell double-quoted string body the way PowerShell does for the
// characters that matter here: a backtick escapes the next character, and an
// unescaped `$` starts a variable or subexpression.
const evaluatePowerShellDoubleQuoted = (body) => {
  let result = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '`') {
      result += body[++i]
    } else if (body[i] === '$') {
      throw new Error(`PowerShell would expand "${body.slice(i, i + 12)}"`)
    } else {
      result += body[i]
    }
  }
  return result
}

describe('appsync console commands on Windows', () => {
  const originalPlatform = process.platform
  const originalSpawn = childProcess.spawn
  let plugin

  beforeAll(async () => {
    // open@10 reads process.platform when it is first imported.
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const given = await import('./given.js')
    plugin = given.plugin()
    plugin.getApiIdFromStack = async () => API_ID
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    childProcess.spawn = originalSpawn
  })

  // Runs the command and returns the URL PowerShell ends up starting.
  const urlStartedBy = async (command) => {
    const spawned = new Promise((resolve) => {
      childProcess.spawn = jest.fn((file, args) => {
        resolve({ file, args })
        return {
          once: (event, callback) =>
            event === 'spawn' && setImmediate(callback),
          on: () => {},
          unref: () => {},
        }
      })
    })
    await command()
    const { file, args } = await spawned
    expect(file).toMatch(/powershell\.exe$/i)
    expect(args.at(-2)).toBe('-EncodedCommand')
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le')
    const [, body] = script.match(/^Start "(.*)"$/s)
    return evaluatePowerShellDoubleQuoted(body)
  }

  it('opens the CloudWatch log group of the API', async () => {
    expect(await urlStartedBy(() => plugin.openCloudWatch())).toBe(
      `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Fappsync$252Fapis$252F${API_ID}`,
    )
  })

  it('opens the AppSync console of the API', async () => {
    expect(await urlStartedBy(() => plugin.openConsole())).toBe(
      `https://console.aws.amazon.com/appsync/home?region=us-east-1#/${API_ID}/v1/home`,
    )
  })
})
