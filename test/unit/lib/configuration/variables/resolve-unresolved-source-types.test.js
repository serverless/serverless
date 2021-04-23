'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../lib/configuration/variables/resolve');
const resolveUnresolvedSourceTypes = require('../../../../../lib/configuration/variables/resolve-unresolved-source-types');

describe('test/unit/lib/configuration/variables/resolve-unresolved-source-types.test.js', () => {
  const configuration = {
    resolved: 'foo${recognized:}',
    unrecognized: 'foo${unrecognized:}',
    unrecognizedInParens: 'foo${recognized(${unrecognized:}, ${unrecognized2:})}',
    unrecognizedInAddress: 'foo${recognized:${unrecognized:}}',
    unrecognizedInParensAndAddress:
      'foo${recognized(${unrecognized:}, ${unrecognized2:}):${unrecognized3:}}',
    unrecognizedFallback: 'foo${recognized:, unrecognized:}',
    otherUnrecognizedFallback: 'foo${unrecognized:, unrecognized4:}',
    deep: {
      resolved: 'foo${recognized:}',
      unrecognized: 'foo${unrecognized:}',
      unrecognizedInParens: 'foo${recognized(${unrecognized:}, ${unrecognized2:})}',
      unrecognizedInAddress: 'foo${recognized:${unrecognized:}}',
      unrecognizedInParensAndAddress:
        'foo${recognized(${unrecognized:}, ${unrecognized2:}):${unrecognized3:}}',
      unrecognizedFallback: 'foo${recognized:, unrecognized:}',
      otherUnrecognizedFallback: 'foo${unrecognized:, unrecognized4:}',
    },
  };

  const sources = {
    recognized: {
      resolve: () => ({ value: 234 }),
    },
  };
  let resultMap;

  before(async () => {
    const variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources,
      options: {},
      fulfilledSources: new Set('recognized'),
    });

    resultMap = resolveUnresolvedSourceTypes(variablesMeta);
  });

  it('should resolve all not resolved sources', () => {
    expect(resultMap).to.deep.equal(
      new Map([
        [
          'unrecognized',
          new Set([
            'unrecognized',
            'unrecognizedInParens',
            'unrecognizedInAddress',
            'unrecognizedInParensAndAddress',
            'otherUnrecognizedFallback',
            'deep\0unrecognized',
            'deep\0unrecognizedInParens',
            'deep\0unrecognizedInAddress',
            'deep\0unrecognizedInParensAndAddress',
            'deep\0otherUnrecognizedFallback',
          ]),
        ],
        [
          'unrecognized2',
          new Set([
            'unrecognizedInParens',
            'unrecognizedInParensAndAddress',
            'deep\0unrecognizedInParens',
            'deep\0unrecognizedInParensAndAddress',
          ]),
        ],
      ])
    );
  });
});
