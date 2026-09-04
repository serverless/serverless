import { jest } from '@jest/globals'
import { esbuildBuildState } from '../../../../../../lib/plugins/aws/mcp/lib/esbuild-build-state.js'

const esbuildLike = ({ functions = {}, extension = '.js' } = {}) => ({
  functions: jest.fn(async () => functions),
  _buildProperties: jest.fn(async () => ({ props: true })),
  _outputExtension: jest.fn(() => extension),
})

describe('esbuildBuildState', () => {
  test('reports nothing bundled without an esbuild plugin', async () => {
    expect(
      await esbuildBuildState({ plugins: [{ registerExternalHttpEvents: 1 }] }),
    ).toEqual({ bundled: new Set(), outputExtension: undefined })
  })

  test('never asks for the extension when nothing was bundled', async () => {
    const plugin = esbuildLike({ functions: {} })
    expect(await esbuildBuildState({ plugins: [plugin] })).toEqual({
      bundled: new Set(),
      outputExtension: undefined,
    })
    expect(plugin._outputExtension).not.toHaveBeenCalled()
  })

  test('names the bundled functions and the emitted extension', async () => {
    const plugin = esbuildLike({
      functions: { crm: {}, docs: {} },
      extension: '.mjs',
    })
    expect(await esbuildBuildState({ plugins: [{}, plugin] })).toEqual({
      bundled: new Set(['crm', 'docs']),
      outputExtension: '.mjs',
    })
    expect(plugin._outputExtension).toHaveBeenCalledWith({ props: true })
  })
})
