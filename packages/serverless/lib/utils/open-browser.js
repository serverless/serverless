import isWsl from 'is-wsl'
import open from 'open'

// open@10 starts the browser on Windows and WSL through PowerShell, with the
// target inside a double-quoted string, so PowerShell would expand `$name`,
// `$(...)` and backtick sequences in a URL. open@11 escapes these itself, but
// it requires Node.js 20; remove this once open@11 or later is in use.
const POWERSHELL_DOUBLE_QUOTED_SPECIAL = /[`$"“”„]/g

export const escapeForPowerShellDoubleQuotes = (value) =>
  value.replace(POWERSHELL_DOUBLE_QUOTED_SPECIAL, '`$&')

// Same condition open@10 uses to take its PowerShell path when no `app` is
// given. is-wsl already returns false inside a container, as open expects.
export const opensThroughPowerShell = ({
  platform = process.platform,
  wsl = isWsl,
} = {}) => platform === 'win32' || wsl

// Takes no open options: with `app` set, open@10 skips PowerShell on WSL, and
// the condition above would no longer match.
export const openBrowser = (url) =>
  open(opensThroughPowerShell() ? escapeForPowerShellDoubleQuotes(url) : url)
