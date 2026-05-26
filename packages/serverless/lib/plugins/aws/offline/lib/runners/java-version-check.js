import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import ServerlessError from '../../../../../serverless-error.js'

const runExecFile = promisify(execFile)

/**
 * Extract the major Java version from `java -version` stderr.
 *
 * Java prints its version string to STDERR (not stdout) in two formats:
 *  - Java 9+: `openjdk version "21.0.2" 2024-01-16 LTS` → major = 21
 *  - Java 8 and earlier: `java version "1.8.0_392"` → major = 8
 *
 * @param {string} stderr
 * @returns {number | null}
 */
export function parseJavaVersion(stderr) {
  const match = stderr.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const first = Number(match[1])
  if (first === 1 && match[2] !== undefined) {
    return Number(match[2])
  }
  return first
}

/**
 * Extract the major version from a declared runtime string.
 *
 * @param {string} runtime
 * @returns {number | null}
 */
function declaredMajor(runtime) {
  const m = String(runtime ?? '').match(/^java(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * Lazy `java -version` invocation. Soft-warns if the local JDK is older
 * than the declared runtime; throws `OFFLINE_JAVA_BINARY_MISSING` on
 * ENOENT.
 *
 * Per design: never blocks invocation. The JVM itself surfaces a
 * meaningful `UnsupportedClassVersionError` at handler load time if the
 * user's bytecode is actually too new for the local JDK; the soft warning
 * here is just an early heads-up.
 *
 * @param {object} options
 * @param {string} options.javaCommand
 * @param {string} options.declaredRuntime
 * @param {object} options.log
 * @param {(cmd: string, args: string[]) => Promise<{ stdout: string, stderr: string }>} [options.runOverride]
 *   Test seam.
 *
 * @returns {Promise<{ majorVersion: number | null, raw: string }>}
 */
export async function checkJavaVersion({
  javaCommand,
  declaredRuntime,
  log,
  runOverride,
}) {
  const runner = runOverride ?? runExecFile

  let stderr
  try {
    const result = await runner(javaCommand, ['-version'])
    stderr = result.stderr ?? ''
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ServerlessError(
        `Java toolchain not found (tried ${javaCommand}). ` +
          `Install a JDK or set JAVA_HOME/PATH.`,
        'OFFLINE_JAVA_BINARY_MISSING',
      )
    }
    // Some JVM implementations print version to stderr AND exit non-zero
    // — tolerate that by reading whatever stderr was captured.
    stderr = err.stderr ?? ''
  }

  const majorVersion = parseJavaVersion(stderr)
  const declared = declaredMajor(declaredRuntime)

  if (
    typeof log?.warning === 'function' &&
    majorVersion !== null &&
    declared !== null &&
    majorVersion < declared
  ) {
    log.warning(
      `Local Java major version ${majorVersion} is older than the declared ` +
        `runtime ${declaredRuntime}. Bytecode targeting ${declaredRuntime} ` +
        `may fail to load (UnsupportedClassVersionError). Install a JDK ` +
        `matching or newer than the declared runtime to silence this warning.`,
    )
  }

  return { majorVersion, raw: stderr }
}
