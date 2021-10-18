'use strict';

const _ = require('lodash');

module.exports = {
  areMergeablePolicyStatements(a, b) {
    const normalize = (segment) => {
      const segments = Array.isArray(segment) ? [...segment] : [segment];
      segments.sort();
      return new Set(segments);
    };

    return ['Effect', 'Action', 'NotAction'].every((segment) =>
      _.isEqual(normalize(a[segment]), normalize(b[segment]))
    );
  },
};
