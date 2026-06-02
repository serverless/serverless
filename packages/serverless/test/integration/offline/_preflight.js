import { execFileSync } from 'node:child_process'

import Dockerode from 'dockerode'

async function dockerOk() {
  try {
    await new Dockerode().ping()
    return true
  } catch {
    return false
  }
}

function onPath(bin) {
  // Most tools answer `--version`; the Go toolchain uses `go version` (a
  // subcommand, not a flag) and exits non-zero on `go --version`, so probe it
  // with its own form. Without this, an installed `go` is wrongly reported as
  // missing and the always-on Go runtime contract fails to boot.
  const args = bin === 'go' ? ['version'] : ['--version']
  try {
    execFileSync(bin, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Assert the integration environment. Throws an actionable error (never skips)
 * when a prerequisite is missing, so a misconfigured environment fails loud.
 *
 * @param {{ docker?: boolean, runtimes?: string[] }} [need]
 */
export async function requireEnv(need = {}) {
  const missing = []
  if (need.docker && !(await dockerOk()))
    missing.push('Docker (daemon not reachable)')
  for (const bin of need.runtimes ?? []) {
    if (!onPath(bin)) missing.push(`${bin} (not on PATH)`)
  }
  if (missing.length) {
    throw new Error(
      `sls offline integration tests require: ${missing.join(', ')}. ` +
        'Install/start the missing prerequisite(s) and re-run.',
    )
  }
}
