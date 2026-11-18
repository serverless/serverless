import fs from 'fs'
import os from 'os'
import path from 'path'
import readConfiguration from '../../../../lib/configuration/read.js'

// The loader imports JavaScript configuration files by path. A bare path is
// not a valid import specifier everywhere: Windows drive letters read as a URL
// scheme, and "#" or "%" in a directory name read as URL syntax on any platform.
describe('reading a JavaScript configuration file', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-config-#%25-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it.each(['serverless.mjs', 'serverless.cjs', 'serverless.js'])(
    'loads %s from a directory whose name has URL characters',
    async (fileName) => {
      fs.writeFileSync(
        path.join(dir, fileName),
        fileName === 'serverless.mjs'
          ? "export default { service: 'url-chars' }\n"
          : "module.exports = { service: 'url-chars' }\n",
      )
      await expect(
        readConfiguration(path.join(dir, fileName)),
      ).resolves.toEqual({ service: 'url-chars' })
    },
  )
})
