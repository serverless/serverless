import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { getConfigFilePath } from '../../../../src/utils/index.js'

const makeDir = async (fileNames = []) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sf-config-file-path-'))
  for (const fileName of fileNames) {
    await writeFile(path.join(dir, fileName), 'placeholder')
  }
  return dir
}

describe('getConfigFilePath', () => {
  test('finds a file across the default supported extensions', async () => {
    const dir = await makeDir(['serverless.yml'])
    const result = await getConfigFilePath({
      configFileName: 'serverless',
      configFileDirPath: dir,
    })
    expect(result).toBe(path.join(dir, 'serverless.yml'))
  })

  describe('with the "extensions" option', () => {
    test('only matches the given extensions', async () => {
      const dir = await makeDir(['template.mjs', 'template.yaml'])
      const result = await getConfigFilePath({
        configFileName: 'template',
        configFileDirPath: dir,
        extensions: ['yaml', 'yml', 'json'],
      })
      expect(result).toBe(path.join(dir, 'template.yaml'))
    })

    test('returns null when only files with other extensions exist', async () => {
      const dir = await makeDir(['template.mjs'])
      const result = await getConfigFilePath({
        configFileName: 'template',
        configFileDirPath: dir,
        extensions: ['yaml', 'yml', 'json'],
      })
      expect(result).toBeNull()
    })
  })
})
