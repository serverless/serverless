import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadHandler } from '../../../../../../../../lib/plugins/aws/offline/lib/runners/load-handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.resolve(__dirname, '../../__fixtures__/handlers')

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
})
