'use strict'

const { expect } = require('chai')
const awsServiceCommonOptions = require('../../../../../../lib/cli/commands-schema/common-options/aws-service')

describe('test/unit/lib/cli/commands-schema/common-options/aws-service.test.js', () => {
  it('should expose global common options', () =>
    expect(awsServiceCommonOptions).to.have.property('help'))
  it('should expose service common options', () =>
    expect(awsServiceCommonOptions).to.have.property('config'))
  it('should expose AWS service common options', () =>
    expect(awsServiceCommonOptions).to.have.property('region'))
})
