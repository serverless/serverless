'use strict'

const Deploy = require('../../../../lib/plugins/deploy')
const Serverless = require('../../../../lib/serverless')
const sinon = require('sinon')
const chai = require('chai')
chai.use(require('chai-as-promised'))

const expect = chai.expect

describe('Deploy', () => {
  let deploy
  let serverless
  let options

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    options = {}
    deploy = new Deploy(serverless, options)
    deploy.serverless.providers = { validProvider: true }
    deploy.serverless.service.provider.name = 'validProvider'
  })

  describe('#constructor()', () => {
    it('should have commands', () => expect(deploy.commands).to.be.not.empty)
    it('should have hooks', () => expect(deploy.hooks).to.be.not.empty)
    it('should work without options', () => {
      const noOptionDeploy = new Deploy(serverless)
      expect(noOptionDeploy).to.have.property('options').to.be.eql({})
    })
  })

  describe('"before:deploy:deploy" hook', () => {
    let spawnStub
    let spawnPackageStub
    let spawnDeployFunctionStub

    beforeEach(() => {
      spawnStub = sinon.stub(serverless.pluginManager, 'spawn')
      spawnPackageStub = spawnStub.withArgs('package').resolves()
      spawnDeployFunctionStub = spawnStub.withArgs('deploy:function').resolves()
    })

    afterEach(() => {
      serverless.pluginManager.spawn.restore()
    })

    it('should resolve if the package option is set', async () => {
      deploy.options.package = false
      deploy.serverless.service.package.path = 'some_path'

      await deploy.hooks['before:deploy:deploy']()

      expect(spawnPackageStub.called).to.be.false
    })

    it('should resolve if the service package path is set', async () => {
      deploy.options.package = 'some_path'
      deploy.serverless.service.package.path = false

      await deploy.hooks['before:deploy:deploy']()

      expect(spawnPackageStub.called).to.be.false
    })

    it('should use the default packaging mechanism if no packaging config is provided', async () => {
      deploy.options.package = false
      deploy.serverless.service.package.path = false

      await deploy.hooks['before:deploy:deploy']()

      expect(spawnDeployFunctionStub.called).to.be.false
      expect(spawnPackageStub.calledOnce).to.be.true
      expect(spawnPackageStub.calledWithExactly('package')).to.be.true
    })

    it('should throw an error if provider does not exist', async () => {
      deploy.serverless.service.provider.name = 'nonExistentProvider'

      return expect(
        deploy.hooks['before:deploy:deploy'](),
      ).to.eventually.be.rejectedWith(
        'The specified provider "nonExistentProvider" does not exist.',
      )
    })
  })
})
