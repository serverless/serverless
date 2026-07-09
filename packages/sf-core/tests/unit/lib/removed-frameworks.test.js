import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { assertNoRemovedFrameworkConfig } from '../../../src/lib/removed-frameworks.js'

const makeDir = async (fileNames = []) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sf-removed-frameworks-'))
  for (const fileName of fileNames) {
    await writeFile(path.join(dir, fileName), 'name: test-app\n')
  }
  return dir
}

describe('assertNoRemovedFrameworkConfig', () => {
  test('throws FRAMEWORK_SUPPORT_REMOVED for serverless.containers.yml', async () => {
    const dir = await makeDir(['serverless.containers.yml'])
    await expect(
      assertNoRemovedFrameworkConfig({ workingDir: dir }),
    ).rejects.toMatchObject({
      code: 'FRAMEWORK_SUPPORT_REMOVED',
      message: expect.stringContaining('Serverless Container Framework'),
    })
  })

  test('throws FRAMEWORK_SUPPORT_REMOVED for serverless.ai.yaml', async () => {
    const dir = await makeDir(['serverless.ai.yaml'])
    await expect(
      assertNoRemovedFrameworkConfig({ workingDir: dir }),
    ).rejects.toMatchObject({
      code: 'FRAMEWORK_SUPPORT_REMOVED',
      message: expect.stringContaining('Serverless AI Framework'),
    })
  })

  test('mentions the pinned last supporting version', async () => {
    const dir = await makeDir(['serverless.containers.yml'])
    await expect(
      assertNoRemovedFrameworkConfig({ workingDir: dir }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('serverless@4.39.0'),
    })
  })

  test('resolves for a traditional serverless.yml project', async () => {
    const dir = await makeDir(['serverless.yml'])
    await expect(
      assertNoRemovedFrameworkConfig({ workingDir: dir }),
    ).resolves.toBeUndefined()
  })

  test('resolves for an empty directory', async () => {
    const dir = await makeDir()
    await expect(
      assertNoRemovedFrameworkConfig({ workingDir: dir }),
    ).resolves.toBeUndefined()
  })

  test('resolves (does not throw) for a nonexistent directory', async () => {
    await expect(
      assertNoRemovedFrameworkConfig({
        workingDir: path.join(tmpdir(), 'does-not-exist-xyz'),
      }),
    ).resolves.toBeUndefined()
  })
})
