'use strict';

const expect = require('chai').expect;
const deepSortObjectByKey = require('../../../../lib/utils/deep-sort-object-by-key');

describe('deepSortObjectByKey', () => {
  it('handles plain object', () => {
    const input = {
      b: 'shouldBeLast',
      a: 'shouldBeFirst',
    };

    const result = deepSortObjectByKey(input);

    const expectedResult = JSON.stringify({
      a: 'shouldBeFirst',
      b: 'shouldBeLast',
    });
    expect(JSON.stringify(result)).to.equal(expectedResult);
  });

  it('handles non-object values', () => {
    const input = 'shouldbereturnedasis';

    const result = deepSortObjectByKey(input);

    expect(result).to.equal(input);
  });

  it('handles array with objects', () => {
    const input = [
      {
        b: 'shouldBeLast',
        a: 'shouldBeFirst',
      },
      {
        d: 'shouldBeLast',
        c: 'shouldBeFirst',
      },
    ];

    const result = deepSortObjectByKey(input);

    const expectedResult = JSON.stringify([
      {
        a: 'shouldBeFirst',
        b: 'shouldBeLast',
      },
      {
        c: 'shouldBeFirst',
        d: 'shouldBeLast',
      },
    ]);
    expect(JSON.stringify(result)).to.equal(expectedResult);
  });

  it('handles nested, complex objects', () => {
    const input = {
      b: 'shouldBeLast',
      a: {
        d: 'nestedPlainValue',
        c: {
          f: 'shouldBeLast',
          e: 'shouldBeFirst',
        },
      },
    };

    const result = deepSortObjectByKey(input);
    const expectedResult = JSON.stringify({
      a: {
        c: {
          e: 'shouldBeFirst',
          f: 'shouldBeLast',
        },
        d: 'nestedPlainValue',
      },
      b: 'shouldBeLast',
    });

    expect(JSON.stringify(result)).to.equal(expectedResult);
  });
});
