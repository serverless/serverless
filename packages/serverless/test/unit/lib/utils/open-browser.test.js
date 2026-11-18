import { jest } from '@jest/globals'

const open = jest.fn(async () => {})
jest.unstable_mockModule('open', () => ({ default: open }))
// Not WSL, so the result depends on the platform alone, whatever machine runs
// the tests.
jest.unstable_mockModule('is-wsl', () => ({ default: false }))

const { escapeForPowerShellDoubleQuotes, openBrowser, opensThroughPowerShell } =
  await import('../../../../lib/utils/open-browser.js')

describe('escapeForPowerShellDoubleQuotes', () => {
  it('escapes the characters PowerShell interprets in double quotes', () => {
    expect(escapeForPowerShellDoubleQuotes('a$252Fb`c"d“e')).toBe(
      'a`$252Fb``c`"d`“e',
    )
  })

  it('leaves other URLs unchanged', () => {
    const url = 'https://example.com/a?b=c&d=%24#/e'
    expect(escapeForPowerShellDoubleQuotes(url)).toBe(url)
  })
})

describe('opensThroughPowerShell', () => {
  it('is true on Windows and WSL only', () => {
    expect(opensThroughPowerShell({ platform: 'win32', wsl: false })).toBe(true)
    expect(opensThroughPowerShell({ platform: 'linux', wsl: true })).toBe(true)
    expect(opensThroughPowerShell({ platform: 'linux', wsl: false })).toBe(
      false,
    )
    expect(opensThroughPowerShell({ platform: 'darwin', wsl: false })).toBe(
      false,
    )
  })
})

describe('openBrowser', () => {
  const originalPlatform = process.platform
  const url =
    'https://console.aws.amazon.com/cloudwatch/home#logsV2:log-group/$252Faws`a"b'

  const openOn = async (platform) => {
    Object.defineProperty(process, 'platform', { value: platform })
    open.mockClear()
    await openBrowser(url)
    expect(open).toHaveBeenCalledTimes(1)
    return open.mock.calls[0]
  }

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it.each(['linux', 'darwin'])(
    'passes the URL unchanged on %s',
    async (platform) => {
      expect(await openOn(platform)).toEqual([url])
    },
  )

  it('passes the escaped URL on Windows', async () => {
    expect(await openOn('win32')).toEqual([
      'https://console.aws.amazon.com/cloudwatch/home#logsV2:log-group/`$252Faws``a`"b',
    ])
  })
})
