'use strict';

const _ = require('lodash');
const chai = require('chai');

const expect = chai.expect;

module.exports = {
  // Confirm that `statement` is reflected in `statements`
  expectToIncludeStatement: (statements, statement) => {
    const matchingStatement = statements.find((el) => areDuplicateStatements(el, statement)) || {};

    const toArray = (value) => {
      return Array.isArray(value) ? [...value] : [value];
    };

    expect(toArray(matchingStatement.Resource)).to.deep.include.members(
      toArray(statement.Resource)
    );
  },
};

const areDuplicateStatements = (a, b) => {
  const normalize = (segment) => {
    const segments = Array.isArray(segment) ? [...segment] : [segment];
    segments.sort();
    return new Set(segments);
  };

  return ['Effect', 'Action', 'NotAction'].every((segment) =>
    _.isEqual(normalize(a[segment]), normalize(b[segment]))
  );
};
