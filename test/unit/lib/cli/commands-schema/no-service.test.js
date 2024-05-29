'use strict'

const { expect } = require('chai')
const noServiceCommands = require('../../../../../lib/cli/commands-schema/no-service')

describe('test/unit/lib/cli/commands-schema/no-service.test.js', () => {
  it('should expose no service commands', () =>
    expect(noServiceCommands.get('create')).to.have.property('options'))
  it('should not expose service commands', () =>
    expect(noServiceCommands.has('package')).to.be.false)
  it('should not expose AWS service commands', () =>
    expect(noServiceCommands.has('deploy')).to.be.false)

  it('should expose no service options on no service commands', () =>
    expect(noServiceCommands.get('config').options).to.have.property('help'))
  it('should not expose service options on no service commands', () =>
    expect(noServiceCommands.get('config').options).to.not.have.property(
      'config',
    ))
  it('should not expose AWS service options on no service commands', () =>
    expect(noServiceCommands.get('config').options).to.not.have.property(
      'region',
    ))
})
