import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from '@jest/globals'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'

// Several processes (parallel deploys, Compose services) can compile the same
// schema at once. Each writes the validator to a temporary file and moves it
// onto the shared cache path. On Windows, that move fails with EPERM when
// another process has just put the same file in place.
const moveFile = jest.fn()
jest.unstable_mockModule(
  '../../../../../lib/utils/fs/safe-move-file.js',
  () => ({
    default: moveFile,
  }),
)

const { default: getValidate } =
  await import('../../../../../lib/classes/config-schema-handler/resolve-ajv-validate.js')

const eperm = (from, to) =>
  Object.assign(
    new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`),
    { code: 'EPERM' },
  )

describe('resolve-ajv-validate cache writes', () => {
  let cacheBaseDir
  let originalCacheBaseDir

  beforeEach(async () => {
    cacheBaseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ajv-cache-test-'))
    originalCacheBaseDir = process.env.SLS_SCHEMA_CACHE_BASE_DIR
    process.env.SLS_SCHEMA_CACHE_BASE_DIR = cacheBaseDir
    moveFile.mockReset()
  })

  afterEach(async () => {
    if (originalCacheBaseDir === undefined) {
      delete process.env.SLS_SCHEMA_CACHE_BASE_DIR
    } else {
      process.env.SLS_SCHEMA_CACHE_BASE_DIR = originalCacheBaseDir
    }
    await fsp.rm(cacheBaseDir, { recursive: true, force: true })
  })

  it('uses the cached validator when another process wrote it first', async () => {
    moveFile.mockImplementation(async (from, to) => {
      // The other process wins the race with the identical validator.
      await fsp.copyFile(from, to)
      throw eperm(from, to)
    })
    const schema = {
      type: 'object',
      properties: { lostRace: { type: 'string' } },
    }

    const validate = await getValidate(schema)

    expect(validate({ lostRace: 'yes' })).toBe(true)
    expect(validate({ lostRace: {} })).toBe(false)
  })

  it('does not fail when the temporary directory cannot be removed', async () => {
    moveFile.mockImplementation((from, to) => fsp.rename(from, to))
    const rm = jest.spyOn(fsp, 'rm').mockRejectedValueOnce(
      Object.assign(new Error('EBUSY: resource busy or locked'), {
        code: 'EBUSY',
      }),
    )
    const schema = {
      type: 'object',
      properties: { lockedTmpDir: { type: 'string' } },
    }

    try {
      const validate = await getValidate(schema)
      expect(validate({ lockedTmpDir: 'yes' })).toBe(true)
      expect(rm).toHaveBeenCalled()
    } finally {
      rm.mockRestore()
    }
  })

  it('still fails when the move fails and no validator was written', async () => {
    moveFile.mockImplementation(async (from, to) => {
      throw eperm(from, to)
    })
    const schema = {
      type: 'object',
      properties: { nothingWritten: { type: 'string' } },
    }

    await expect(getValidate(schema)).rejects.toThrow(/EPERM/)
  })
})
