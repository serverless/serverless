import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { startsWithBlankLine } from '../../../bin/blankLine.js'

const blankLine = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../bin/blankLine.js',
)
const stdoutOf = (args) =>
  execFileSync(process.execPath, [blankLine, ...args], { encoding: 'utf8' })

test('every command starts with a blank line, except one run with --json', () => {
  expect(startsWithBlankLine(['node', 'sf-core.js', 'deploy'])).toBe(true)
  expect(startsWithBlankLine(['node', 'sf-core.js', 'dev', '--json'])).toBe(
    false,
  )
  expect(
    startsWithBlankLine(['node', 'sf-core.js', 'dev', 'status', '--json=true']),
  ).toBe(false)
  expect(
    startsWithBlankLine(['node', 'sf-core.js', 'dev', '--json=false']),
  ).toBe(true)
  // The node binary and the script path are not the command's arguments.
  expect(startsWithBlankLine(['--json', '--json'])).toBe(true)
})

test('the blank line follows the rule that turns JSON on in the parsed options', () => {
  const blank = (...args) =>
    startsWithBlankLine(['node', 'sf-core.js', ...args])
  expect(blank('dev', '--detach', '--json=1')).toBe(false)
  expect(blank('dev', '--detach', '--json', 'true')).toBe(false)
  expect(blank('dev', '--detach', '--json', '--stage', 'dev')).toBe(false)
  expect(blank('dev', '--detach', '--json=0')).toBe(true)
  expect(blank('dev', '--detach', '--json', 'false')).toBe(true)
  expect(blank('dev', '--detach', '--json', '--no-json')).toBe(true)
  expect(blank('dev', '--detach', '--no-json', '--json')).toBe(false)
})

test('the blank line goes to stdout only without --json', () => {
  expect(stdoutOf(['dev', 'status'])).toBe('\n')
  expect(stdoutOf(['dev', 'status', '--json'])).toBe('')
  expect(stdoutOf(['dev', 'status', '--json=true', '--stage', 'dev'])).toBe('')
  expect(stdoutOf(['dev', 'status', '--json=1'])).toBe('')
  expect(stdoutOf(['dev', 'status', '--json=false'])).toBe('\n')
})
