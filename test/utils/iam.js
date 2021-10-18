'use strict';

const chai = require('chai');
const { areMergeablePolicyStatements } = require('../../lib/plugins/aws/package/lib/utils');

const expect = chai.expect;

module.exports = {
  // Confirm that `statement` is reflected in `statements`
  expectToIncludeStatement: (statements, statement) => {
    const matchingStatement =
      statements.find((el) => areMergeablePolicyStatements(el, statement)) || {};

    const toArray = (value) => {
      return Array.isArray(value) ? [...value] : [value];
    };

    expect(toArray(matchingStatement.Resource)).to.deep.include.members(
      toArray(statement.Resource)
    );
  },
};
