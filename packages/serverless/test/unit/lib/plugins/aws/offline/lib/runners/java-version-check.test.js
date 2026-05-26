import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import {
  checkJavaVersion,
  parseJavaVersion,
} from '../../../../../../../../lib/plugins/aws/offline/lib/runners/java-version-check.js'

const runExecFile = promisify(execFile)

const javaAvailable = await (async () => {
  try {
    await runExecFile('java', ['-version'])
    return true
  } catch {
    return false
  }
})()
const itJdk = javaAvailable ? it : it.skip

describe('parseJavaVersion', () => {
  it('parses Java 21 stderr output', () => {
    const stderr =
      'openjdk version "21.0.2" 2024-01-16 LTS\n' +
      'OpenJDK Runtime Environment Zulu21.32+17-CA (build 21.0.2+13-LTS)\n'
    expect(parseJavaVersion(stderr)).toBe(21)
  })

  it('parses Java 8 stderr output (old-style version string)', () => {
    const stderr =
      'java version "1.8.0_392"\n' +
      'Java(TM) SE Runtime Environment (build 1.8.0_392-b08)\n'
    expect(parseJavaVersion(stderr)).toBe(8)
  })

  it('parses Java 17 stderr output', () => {
    const stderr =
      'openjdk version "17.0.9" 2023-10-17\n' +
      'OpenJDK Runtime Environment (build 17.0.9+9-Debian-1deb12u1)\n'
    expect(parseJavaVersion(stderr)).toBe(17)
  })

  it('returns null on unparseable input', () => {
    expect(parseJavaVersion('')).toBeNull()
    expect(parseJavaVersion('not a version string at all')).toBeNull()
  })
})

describe('checkJavaVersion', () => {
  it('throws OFFLINE_JAVA_BINARY_MISSING when java command does not exist', async () => {
    await expect(
      checkJavaVersion({
        javaCommand: '/nonexistent/java',
        declaredRuntime: 'java21',
        log: { warning() {} },
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_JAVA_BINARY_MISSING' })
  })

  itJdk('returns the major version when java is on PATH', async () => {
    const result = await checkJavaVersion({
      javaCommand: 'java',
      declaredRuntime: 'java21',
      log: { warning() {} },
    })
    expect(typeof result.majorVersion).toBe('number')
    expect(result.majorVersion).toBeGreaterThanOrEqual(8)
  })

  it('soft-warns when local JDK is older than declared runtime (no throw)', async () => {
    const warnings = []
    const result = await checkJavaVersion({
      javaCommand: 'java',
      declaredRuntime: 'java21',
      log: {
        warning(msg) {
          warnings.push(msg)
        },
      },
      runOverride: async () => ({
        stdout: '',
        stderr:
          'openjdk version "11.0.21" 2023-10-17\n' +
          'OpenJDK Runtime Environment (build 11.0.21+9)\n',
      }),
    })
    expect(result.majorVersion).toBe(11)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/java21/)
    expect(warnings[0]).toMatch(/11/)
  })

  it('does not warn when local JDK matches or exceeds declared runtime', async () => {
    const warnings = []
    await checkJavaVersion({
      javaCommand: 'java',
      declaredRuntime: 'java17',
      log: {
        warning(msg) {
          warnings.push(msg)
        },
      },
      runOverride: async () => ({
        stdout: '',
        stderr: 'openjdk version "21.0.2" 2024-01-16 LTS\n',
      }),
    })
    expect(warnings).toHaveLength(0)
  })

  it('does not warn for java8.al2 runtime declaration with local Java 11', async () => {
    const warnings = []
    await checkJavaVersion({
      javaCommand: 'java',
      declaredRuntime: 'java8.al2',
      log: {
        warning(msg) {
          warnings.push(msg)
        },
      },
      runOverride: async () => ({
        stdout: '',
        stderr: 'openjdk version "11.0.21" 2023-10-17\n',
      }),
    })
    expect(warnings).toHaveLength(0)
  })
})
