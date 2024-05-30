'use strict'

const { expect } = require('chai')
const awsServiceCommands = require('../../../../../lib/cli/commands-schema/aws-service')

describe('test/unit/lib/cli/commands-schema/aws-service.test.js', () => {
  it('should expose no service commands', () =>
    expect(awsServiceCommands.get('create')).to.have.property('options'))
  it('should expose service commands', () =>
    expect(awsServiceCommands.get('package')).to.have.property('options'))
  it('should expose AWS service commands', () =>
    expect(awsServiceCommands.get('deploy')).to.have.property('options'))

  it('should expose no service options on AWS service commands', () =>
    expect(awsServiceCommands.get('deploy').options).to.have.property('help'))
  it('should expose service options on AWS service commands', () =>
    expect(awsServiceCommands.get('deploy').options).to.have.property('config'))
  it('should expose AWS options on AWS service commands', () =>
    expect(awsServiceCommands.get('deploy').options).to.have.property('region'))
})
