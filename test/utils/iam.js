'use strict';

const chai = require('chai');
const { isMergeablePolicyStatement } = require('../../lib/plugins/aws/package/lib/utils');

const expect = chai.expect;

module.exports = {
  // Confirm that `statement` is reflected in `statements`
  expectToIncludeStatement: (statements, statement) => {
    const statement_ = statements.find((el) => isMergeablePolicyStatement(el, statement)) || {};

    const toArray = (value) => {
      return Array.isArray(value) ? [...value] : [value];
    };

    expect(toArray(statement_.Resource)).to.deep.include.members(toArray(statement.Resource));
  },
};
