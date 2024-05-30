'use strict'

const { expect } = require('chai')

const humanReadable = require('../../../../lib/templates/recommended-list/human-readable')

describe('test/unit/lib/templates/recommended-list.test.js', () => {
  // Sanity check
  it('should export string withlist of templates', async () => {
    expect(typeof humanReadable).to.equal('string')
    expect(humanReadable).to.include('aws-nodejs')
  })
})
