import { describe, expect, it } from '@jest/globals'

const { assertPipCmdExtraArgs, pipAcceptsSystem } =
  await import('../../../../../../lib/plugins/python/lib/pip.js')

// Configuration mistakes around the pip install get an error that names the
// setting to change, without a stack trace.
describe('pip configuration errors', () => {
  it('a missing interpreter names pythonBin', async () => {
    // The interpreter is spawned without a shell, so a missing one fails with
    // ENOENT rather than a "command not found" message.
    const error = await pipAcceptsSystem('python3.99-not-installed').catch(
      (e) => e,
    )
    expect(error.code).toBe('PYTHON_REQUIREMENTS_PYTHON_NOT_FOUND')
    expect(error.message).toBe(
      '"python3.99-not-installed" was not found. Python requirements are installed with the interpreter named after the runtime unless custom.pythonRequirements.pythonBin names another; install python3.99-not-installed, or set pythonBin to the interpreter you have (for example "python3"), which must be the runtime\'s Python version.',
    )
  })

  it('pipCmdExtraArgs items must be strings', () => {
    // `- --only-binary=:all:` unquoted in YAML parses as a map.
    for (const extraArgs of [
      [{ '--only-binary=:all': null }],
      '--platform=manylinux2014_x86_64',
      [42],
    ]) {
      expect(() => assertPipCmdExtraArgs(extraArgs)).toThrow(
        expect.objectContaining({
          code: 'PYTHON_REQUIREMENTS_INVALID_PIP_CMD_EXTRA_ARGS',
          message:
            'custom.pythonRequirements.pipCmdExtraArgs must be a list of strings. Quote items that contain a colon, for example - "--only-binary=:all:".',
        }),
      )
    }
  })

  it('a list of strings, an empty list, or no setting is accepted', () => {
    for (const extraArgs of [
      ['--platform=manylinux2014_x86_64', '--only-binary=:all:'],
      [],
      undefined,
    ]) {
      expect(() => assertPipCmdExtraArgs(extraArgs)).not.toThrow()
    }
  })
})
