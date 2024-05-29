'use strict'

const chai = require('chai')
const path = require('path')
const Package = require('../../../../../../../lib/plugins/aws/common/index')
const Serverless = require('../../../../../../../lib/serverless')
const { getTmpDirPath } = require('../../../../../../utils/fs')

chai.use(require('chai-as-promised'))

const expect = chai.expect

describe('#cleanupTempDir()', () => {
  let serverless
  let packageService

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    packageService = new Package(serverless)

    serverless.serviceDir = getTmpDirPath()
  })

  it('should remove .serverless in the service directory', async () => {
    const serverlessTmpDirPath = path.join(
      packageService.serverless.serviceDir,
      '.serverless',
      'README',
    )
    serverless.utils.writeFileSync(serverlessTmpDirPath, 'Some README content')

    return packageService.cleanupTempDir().then(() => {
      expect(
        serverless.utils.dirExistsSync(
          path.join(packageService.serverless.serviceDir, '.serverless'),
        ),
      ).to.equal(false)
    })
  })

  it('should resolve if servicePath is not present', async () => {
    delete serverless.serviceDir
    return expect(packageService.cleanupTempDir()).to.eventually.be.fulfilled
  })

  it('should resolve if the .serverless directory is not present', async () => {
    return expect(packageService.cleanupTempDir()).to.eventually.be.fulfilled
  })
})
