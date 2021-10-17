'use strict';

const expect = require('chai').expect;
const {
  mergeStatements,
} = require('../../../../../../../lib/plugins/aws/package/lib/resolveIamRoles');

describe.only('lib/plugins/aws/package/lib/resolveIamRoles.test.js', () => {
  describe('mergeStatements()', () => {
    it('handles one group', () => {
      const input = [
        { Effect: 'a', Action: 'a', Resource: 'a' },
        { Effect: 'a', Action: 'a', Resource: 'b' },
      ];
      const expectedResult = [{ Effect: 'a', Action: 'a', Resource: ['a', 'b'] }];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles multiple groups', () => {
      const input = [
        { Effect: 'a', Action: 'a', Resource: 'a' },
        { Effect: 'a', Action: 'a', Resource: 'b' },
        { Effect: 'a', Action: 'b', Resource: 'a' },
        { Effect: 'a', Action: 'b', Resource: 'b' },
      ];
      const expectedResult = [
        { Effect: 'a', Action: 'a', Resource: ['a', 'b'] },
        { Effect: 'a', Action: 'b', Resource: ['a', 'b'] },
      ];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles `NotAction`', () => {
      const input = [
        { Effect: 'a', NotAction: 'a', Resource: 'a' },
        { Effect: 'a', NotAction: 'a', Resource: 'b' },
        { Effect: 'b', Action: 'b', Resource: 'a' },
        { Effect: 'b', Action: 'b', Resource: 'b' },
      ];
      const expectedResult = [
        { Effect: 'a', NotAction: 'a', Resource: ['a', 'b'] },
        { Effect: 'b', Action: 'b', Resource: ['a', 'b'] },
      ];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles array `Resource`', () => {
      const input = [
        { Effect: 'a', Action: 'a', Resource: 'a' },
        { Effect: 'a', Action: 'a', Resource: ['b', 'c'] },
      ];
      const expectedResult = [{ Effect: 'a', Action: 'a', Resource: ['a', 'b', 'c'] }];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles array of object `Resource`', () => {
      const input = [
        { Effect: 'a', Action: 'a', Resource: 'a' },
        { Effect: 'a', Action: 'a', Resource: ['b', 'c'] },
        { Effect: 'a', Action: 'a', Resource: { d: 'd' } },
        { Effect: 'a', Action: 'a', Resource: [{ e: 'e' }, 'f', { g: 'g' }] },
      ];
      const expectedResult = [
        {
          Effect: 'a',
          Action: 'a',
          Resource: ['a', 'b', 'c', { d: 'd' }, { e: 'e' }, 'f', { g: 'g' }],
        },
      ];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles array `Action`', () => {
      const input = [
        { Effect: 'a', Action: ['a', 'b'], Resource: 'a' },
        { Effect: 'a', Action: ['b', 'a'], Resource: ['b', 'c'] },
      ];
      const expectedResult = [{ Effect: 'a', Action: ['a', 'b'], Resource: ['a', 'b', 'c'] }];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles `Action`', () => {
      const input = [
        { Effect: 'a', Action: ['a', 'b'], Resource: 'a' },
        { Effect: 'a', Action: ['b', 'a'], Resource: ['b', 'c'] },
      ];
      const expectedResult = [{ Effect: 'a', Action: ['a', 'b'], Resource: ['a', 'b', 'c'] }];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });

    it('handles same `Action` with different `Effect`', () => {
      const input = [
        { Effect: 'a', Action: ['a', 'b'], Resource: 'a' },
        { Effect: 'b', Action: ['a', 'b'], Resource: [] },
        { Effect: 'a', Action: ['b', 'a'], Resource: ['c', 'b'] },
        { Effect: 'b', Action: ['a', 'b'], Resource: ['b'] },
      ];
      const expectedResult = [
        { Effect: 'a', Action: ['a', 'b'], Resource: ['a', 'c', 'b'] },
        { Effect: 'b', Action: ['a', 'b'], Resource: 'b' },
      ];

      const result = mergeStatements(input);
      expect(result).to.deep.equal(expectedResult);
    });
  });
});
