'use strict';

const { expect } = require('chai');

const isDashboardEnabled = require('../../../../lib/configuration/is-dashboard-enabled');

describe('test/unit/lib/configuration/is-dashboard-enabled.test.js', () => {
  it('should return boolean', () => {
    expect(typeof isDashboardEnabled({ configuration: {}, options: {} })).to.equal('boolean');
  });
});
