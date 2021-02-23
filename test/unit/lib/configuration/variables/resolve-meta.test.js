'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../lib/configuration/variables/resolve-meta');

describe('test/unit/lib/configuration/variables/resolve-meta.test.js', () => {
  it('should resolve variables map', () => {
    const meta = Array.from(
      resolveMeta({
        string: 'bar',
        number: 12,
        boolean: true,
        array: ['bar', 'foo${marko:}', [12, {}, '${nestedArray:}']],
        object: {
          var: '${var:}',
          other: 'strg',
          nested: {
            number: 12,
            var: '${elo:}',
            error: 'sdf${fpp:',
          },
        },
        var: '${halo()}',
      })
    );

    // Normalize (workaround for lack of property matchers on chai side)
    for (const [, value] of meta) {
      if (value.error) value.error = value.error.code;
    }
    expect(meta).to.deep.equal([
      [
        `array${'\0'}1`,
        {
          value: 'foo${marko:}',
          variables: [{ start: 3, end: 12, sources: [{ type: 'marko' }] }],
        },
      ],
      [
        `array${'\0'}2${'\0'}2`,
        { value: '${nestedArray:}', variables: [{ sources: [{ type: 'nestedArray' }] }] },
      ],
      ['object\0var', { value: '${var:}', variables: [{ sources: [{ type: 'var' }] }] }],
      ['object\0nested\0var', { value: '${elo:}', variables: [{ sources: [{ type: 'elo' }] }] }],
      [
        'object\0nested\0error',
        {
          value: 'sdf${fpp:',
          error: 'UNTERMINATED_VARIABLE',
        },
      ],
      ['var', { value: '${halo()}', variables: [{ sources: [{ type: 'halo', params: [] }] }] }],
    ]);
  });
});
