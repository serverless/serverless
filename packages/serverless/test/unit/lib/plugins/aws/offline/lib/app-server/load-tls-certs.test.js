import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadTlsCerts } from '../../../../../../../../lib/plugins/aws/offline/lib/app-server/load-tls-certs.js'

describe('loadTlsCerts', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'offline-tls-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('loads cert.pem and key.pem from the configured directory', async () => {
    await writeFile(join(tmpDir, 'cert.pem'), 'CERT')
    await writeFile(join(tmpDir, 'key.pem'), 'KEY')

    await expect(loadTlsCerts(tmpDir)).resolves.toEqual({
      cert: Buffer.from('CERT'),
      key: Buffer.from('KEY'),
    })
  })

  it('throws OFFLINE_HTTPS_DIR_MISSING when the directory does not exist', async () => {
    await expect(loadTlsCerts(join(tmpDir, 'missing'))).rejects.toMatchObject({
      code: 'OFFLINE_HTTPS_DIR_MISSING',
      message: expect.stringContaining('missing'),
    })
  })

  it('throws OFFLINE_HTTPS_FILES_MISSING when cert.pem or key.pem is absent', async () => {
    await mkdir(join(tmpDir, 'certs'))
    await writeFile(join(tmpDir, 'certs', 'cert.pem'), 'CERT')

    await expect(loadTlsCerts(join(tmpDir, 'certs'))).rejects.toMatchObject({
      code: 'OFFLINE_HTTPS_FILES_MISSING',
      message: expect.stringContaining('key.pem'),
    })
  })
})
