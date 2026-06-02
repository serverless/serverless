import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { loadHandler } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/load-handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.resolve(__dirname, '../../__fixtures__/handlers')

// Write `contents` to a temp `.cjs` file (forces CommonJS regardless of the
// repo's `type: module`) and return its absolute path.
async function writeCjsModule(contents) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'load-handler-'))
  const file = path.join(dir, 'handler.cjs')
  await writeFile(file, contents)
  return file
}

describe('loadHandler', () => {
  it('resolves to the named export when present', async () => {
    const handler = await loadHandler(
      path.join(FIXTURES, 'sync-echo.mjs'),
      'handler',
    )
    expect(typeof handler).toBe('function')
    expect(handler({ x: 1 })).toEqual({ ok: true, echo: { x: 1 } })
  })

  it('throws when the export is missing', async () => {
    await expect(
      loadHandler(path.join(FIXTURES, 'sync-echo.mjs'), 'doesNotExist'),
    ).rejects.toThrow(/Handler export "doesNotExist" is not a function/)
  })

  it('throws when the export is not a function', async () => {
    await expect(
      loadHandler(path.join(FIXTURES, 'non-function-export.mjs'), 'handler'),
    ).rejects.toThrow(/Handler export "handler" is not a function/)
  })

  it('propagates import errors (file not found)', async () => {
    await expect(
      loadHandler(path.join(FIXTURES, 'does-not-exist.mjs'), 'handler'),
    ).rejects.toThrow()
  })

  it('resolves a CommonJS `exports.default` named export', async () => {
    // `exports.default = fn` makes the ESM `default` binding the whole
    // `{ default: fn }` object, so `mod.default` is not itself a function.
    const file = await writeCjsModule(
      "'use strict'\nexports.default = async () => 'ok'\n",
    )
    const handler = await loadHandler(file, 'default')
    expect(typeof handler).toBe('function')
    await expect(handler()).resolves.toBe('ok')
  })

  it('resolves a CommonJS named export (`exports.foo`)', async () => {
    const file = await writeCjsModule(
      "'use strict'\nexports.foo = async () => 'foo-result'\n",
    )
    const handler = await loadHandler(file, 'foo')
    expect(typeof handler).toBe('function')
    await expect(handler()).resolves.toBe('foo-result')
  })

  it('throws the clear error for a genuinely missing CommonJS export', async () => {
    const file = await writeCjsModule(
      "'use strict'\nexports.foo = async () => 'foo-result'\n",
    )
    await expect(loadHandler(file, 'missing')).rejects.toThrow(
      /Handler export "missing" is not a function/,
    )
  })
})
