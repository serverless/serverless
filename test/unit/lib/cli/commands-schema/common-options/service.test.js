'use strict'

const { expect } = require('chai')
const serviceCommonOptions = require('../../../../../../lib/cli/commands-schema/common-options/service')

describe('test/unit/lib/cli/commands-schema/common-options/service.test.js', () => {
  it('should expose global common options', () =>
    expect(serviceCommonOptions).to.have.property('help'))
  it('should expose service common options', () =>
    expect(serviceCommonOptions).to.have.property('config'))
  it('should not expose AWS service common options', () =>
    expect(serviceCommonOptions).to.not.have.property('region'))
})
