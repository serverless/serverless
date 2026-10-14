// Shared by the laptop-runtime tests: temp directories, small file trees, child processes and the
// Python interpreter check. Child processes get only the variables a test passes.
import { randomBytes } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, spawn } from 'child_process'

const made = []

export const tempDir = (prefix = 'sls-dev-local-') => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  made.push(dir)
  return dir
}

/**
 * Removes the directories `tempDir` made. Call it after every process a test started has exited.
 * A process those started can still outlive them by a moment: tsx's esbuild service runs in the
 * handler's working directory and exits once it reads the end of its stdin, after the handler is
 * gone. Windows does not remove a directory a running process has as its working directory, or a
 * file it has open, and fails with EPERM or EBUSY until that process exits, so the removal retries
 * those (and ENOTEMPTY) for up to 5.5 seconds there.
 */
export const cleanTempDirs = () => {
  for (const dir of made.splice(0)) {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  }
}

export const write = (dir, files) => {
  for (const [relativePath, contents] of Object.entries(files)) {
    const file = path.join(dir, ...relativePath.split('/'))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, contents)
  }
  return dir
}

/** The variables a child process needs to start at all, on every OS. */
export const baseEnv = () =>
  Object.fromEntries(
    Object.entries({
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
    }).filter(([, value]) => value !== undefined),
  )

let python
export const pythonCommand = () => {
  if (python !== undefined) return python
  python = null
  const candidates =
    process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
  for (const command of candidates) {
    try {
      const ok = execFileSync(
        command,
        ['-c', 'import sys; print(sys.version_info[:2] >= (3, 9))'],
        { encoding: 'utf8', env: baseEnv(), windowsHide: true },
      ).trim()
      if (ok === 'True') {
        python = command
        break
      }
    } catch {
      // Not installed under this name.
    }
  }
  if (!python && process.env.SLS_DEV_TEST_REQUIRE_TOOLS === '1') {
    throw new Error(
      'SLS_DEV_TEST_REQUIRE_TOOLS=1 but no Python 3.9+ is on PATH',
    )
  }
  return python
}

export const hasPythonModule = (module) => {
  const command = pythonCommand()
  if (!command) return false
  try {
    execFileSync(command, ['-c', `import ${module}`], {
      env: baseEnv(),
      stdio: 'ignore',
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

export const run = (command, args, { cwd, env }) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Whether the process a test started with this pid still runs. A pid that is gone (ESRCH), or that
 * now belongs to another user's process (EPERM: the pid was reused), is not that process any more.
 */
export const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Kills a process a test started, unless it is gone or its pid now belongs to another user. */
export const killPid = (pid) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error
  }
}

/** Polls `check` until it returns true or `ms` pass; resolves whether it did. */
export const waitFor = async (check, ms = 5_000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() >= deadline) return false
    await sleep(25)
  }
  return true
}

/** Stands for the short-lived parent's pid in `startWithShortLivedParent` arguments. */
export const PARENT_PID = '__PARENT_PID__'

/**
 * Starts `command` from a short-lived Node parent that exits on its own after `parentLifetimeMs`,
 * for tests of processes that must exit once their parent is gone. In `args`, the JSON string
 * `"__PARENT_PID__"` (`JSON.stringify(PARENT_PID)`) becomes the parent's pid as a number. Resolves
 * the child's pid; the caller kills the child if it outlives the test.
 */
export const startWithShortLivedParent = async ({
  command,
  args = [],
  cwd,
  env,
  parentLifetimeMs = 300,
}) => {
  const script = [
    "const { spawn } = require('child_process')",
    `const args = ${JSON.stringify(args)}.map((arg) => arg.split(${JSON.stringify(JSON.stringify(PARENT_PID))}).join(String(process.pid)))`,
    `const child = spawn(${JSON.stringify(command)}, args, { cwd: ${JSON.stringify(cwd)}, env: ${JSON.stringify(env)}, stdio: 'ignore', windowsHide: true })`,
    'console.log(child.pid)',
    `setTimeout(() => process.exit(0), ${Number(parentLifetimeMs)})`,
  ].join('\n')
  const parent = await run(process.execPath, ['-e', script], {
    cwd,
    env: baseEnv(),
  })
  const pid = Number(parent.stdout.trim())
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`The parent did not start the child: ${parent.stderr}`)
  }
  return pid
}

/** A worker id the way the laptop runtime makes one: 32 random bytes as hex. */
export const workerId = () => randomBytes(32).toString('hex')

let requests = 0

/** One invocation as the transport would deliver it: Lambda-Runtime-* headers and a raw body. */
export const invocation = ({
  requestId = `req-${(requests += 1)}-0000-0000-0000`,
  deadlineMs = Date.now() + 30_000,
  event = {},
  headers = {},
} = {}) => ({
  headers: {
    'lambda-runtime-aws-request-id': requestId,
    'lambda-runtime-deadline-ms': String(deadlineMs),
    'lambda-runtime-invoked-function-arn':
      'arn:aws:lambda:us-east-1:123456789012:function:svc-dev-api',
    ...headers,
  },
  event: Buffer.from(JSON.stringify(event)),
})

/** A reply with its body read; a stream also records when each chunk arrived and its trailers. */
export const collect = async (reply) => {
  if (reply.kind !== 'stream') {
    return { ...reply, text: reply.body ? reply.body.toString('utf8') : '' }
  }
  const started = Date.now()
  const chunks = []
  const at = []
  for await (const chunk of reply.body) {
    chunks.push(chunk)
    at.push(Date.now() - started)
  }
  const trailers = await reply.ended
  const buffer = Buffer.concat(chunks)
  return { ...reply, buffer, text: buffer.toString('utf8'), at, trailers }
}

const children = []

export const spawnTracked = (command, args, { cwd, env }) => {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdoutText = ''
  child.stderrText = ''
  child.stdout.on('data', (chunk) => {
    child.stdoutText += chunk
  })
  child.stderr.on('data', (chunk) => {
    child.stderrText += chunk
  })
  child.exited = new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  )
  children.push(child)
  return child
}

/** The child's exit, or 'still running' after `ms`; the timer never outlives the wait. */
export const exitWithin = (child, ms) => {
  let timer
  return Promise.race([
    child.exited,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve('still running'), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

export const killChildren = async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await child.exited
    }
  }
}
