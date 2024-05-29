'use strict'

const chai = require('chai')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const { expect } = chai

chai.use(require('chai-as-promised'))
chai.use(require('sinon-chai'))

describe('test/unit/commands/login.test.js', () => {
  let loginDashboardStub
  let login
  before(() => {
    loginDashboardStub = sinon.stub().callsFake(async () => {})
    login = proxyquire('../../../commands/login', {
      '../lib/commands/login/dashboard': loginDashboardStub,
    })
  })

  afterEach(() => sinon.resetHistory())

  it('Should auto choose dashboard in dashboard enabled service', async () => {
    await login({ configuration: { org: 'foo', app: 'foo' }, options: {} })
    expect(loginDashboardStub.calledOnce).to.be.true
  })
})
