'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../lib/configuration/variables/resolve-meta');
const resolveUnresolvedSourceTypes = require('../../../../../lib/configuration/variables/resolve-unresolved-source-types');

describe('test/unit/lib/configuration/variables/resolve-unresolved-source-types.test.js', () => {
  const configuration = {
    foo: {
      params: '${sourceParam(param1, param2)}',
      varParam: '${sourceParam(${sourceDirect:})}',
    },
    static: true,
    address: 'foo${sourceAddress:address-result}',
    varAddress: 'foo${sourceAddress:${sourceDirect:}}',

    nonStringStringPart: 'elo${sourceMissing:, null}',
    notExistingProperty: "${sourceProperty(not, existing), 'notExistingFallback'}",
    nestUnrecognized: {
      unrecognized:
        '${sourceDirect:}|${sourceUnrecognized:}|${sourceDirect(${sourceUnrecognized:})}' +
        '${sourceDirect:${sourceUnrecognized:}}',
    },
  };
  let resultMap;

  before(async () => {
    resultMap = resolveUnresolvedSourceTypes(resolveMeta(configuration));
  });

  it('should resolve all not resolved sources', () => {
    expect(resultMap).to.deep.equal(
      new Map([
        ['sourceParam', new Set(['foo\0params', 'foo\0varParam'])],
        [
          'sourceDirect',
          new Set(['foo\0varParam', 'varAddress', 'nestUnrecognized\0unrecognized']),
        ],
        ['sourceAddress', new Set(['address', 'varAddress'])],
        ['sourceMissing', new Set(['nonStringStringPart'])],
        ['sourceProperty', new Set(['notExistingProperty'])],
        ['sourceUnrecognized', new Set(['nestUnrecognized\0unrecognized'])],
      ])
    );
  });
});
