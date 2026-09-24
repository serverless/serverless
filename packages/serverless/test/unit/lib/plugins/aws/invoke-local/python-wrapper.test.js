import { describe, expect, it } from '@jest/globals'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `invoke local` for Python pipes the event to runtime-wrappers/invoke.py on
// stdin, and the wrapper then hands the handler the terminal as stdin (for
// debuggers). Agents and CI have no controlling terminal: the invoke must
// still run and print the handler's result. `detached: true` starts the
// wrapper in a new session, which has no controlling terminal.
const wrapper = fileURLToPath(
  new URL(
    '../../../../../../lib/plugins/aws/invoke-local/runtime-wrappers/invoke.py',
    import.meta.url,
  ),
)
const python = ['python3', 'python'].find(
  (bin) => spawnSync(bin, ['--version']).status === 0,
)
const posixWithPython = process.platform !== 'win32' && python

const runWithoutTerminal = (cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(python, [wrapper, 'handler', 'hello'], {
      cwd,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(
      JSON.stringify({ event: { name: 'agent' }, context: { name: 'hello' } }),
    )
  })

describe('Python invoke local wrapper', () => {
  ;(posixWithPython ? it : it.skip)(
    'runs the handler when there is no controlling terminal',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-invoke-py-'))
      try {
        fs.writeFileSync(
          path.join(dir, 'handler.py'),
          "def hello(event, context):\n    return {'greeting': 'hi ' + event['name']}\n",
        )
        const { code, stdout, stderr } = await runWithoutTerminal(dir)
        expect(stderr).not.toContain('/dev/tty')
        expect(code).toBe(0)
        expect(JSON.parse(stdout)).toEqual({ greeting: 'hi agent' })
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})
