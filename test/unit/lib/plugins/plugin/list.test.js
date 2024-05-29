'use strict'

const chai = require('chai')
const sinon = require('sinon')
const PluginList = require('../../../../../lib/plugins/plugin/list')
const Serverless = require('../../../../../lib/serverless')
const CLI = require('../../../../../lib/classes/cli')

chai.use(require('sinon-chai'))

const expect = chai.expect

describe('PluginList', () => {
  let pluginList
  let serverless

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.cli = new CLI(serverless)
    const options = {}
    pluginList = new PluginList(serverless, options)
  })

  describe('#constructor()', () => {
    let listStub

    beforeEach(() => {
      listStub = sinon.stub(pluginList, 'list').returns(Promise.resolve())
    })

    afterEach(() => {
      pluginList.list.restore()
    })

    it('should have the sub-command "list"', () => {
      expect(pluginList.commands.plugin.commands.list).to.not.equal(undefined)
    })

    it('should have the lifecycle event "list" for the "list" sub-command', () => {
      expect(
        pluginList.commands.plugin.commands.list.lifecycleEvents,
      ).to.deep.equal(['list'])
    })

    it('should have a "plugin:list:list" hook', () => {
      expect(pluginList.hooks['plugin:list:list']).to.not.equal(undefined)
    })

    it('should run promise chain in order for "plugin:list:list" hook', async () => {
      await pluginList.hooks['plugin:list:list']()
      expect(listStub).to.have.been.calledOnce
    })
  })

  describe('#list()', () => {
    let getPluginsStub
    let displayStub

    beforeEach(() => {
      getPluginsStub = sinon
        .stub(pluginList, 'getPlugins')
        .returns(Promise.resolve())
      displayStub = sinon.stub(pluginList, 'display').returns(Promise.resolve())
    })

    afterEach(() => {
      pluginList.getPlugins.restore()
      pluginList.display.restore()
    })

    it('should print a list with all available plugins', async () =>
      pluginList.list().then(() => {
        expect(getPluginsStub.calledOnce).to.equal(true)
        expect(displayStub.calledOnce).to.equal(true)
      }))
  })
})
