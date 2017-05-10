'use strict';

const expect = require('chai').expect;
const _ = require('lodash');
const findReferences = require('./findReferences');

describe('#findReferences()', () => {
  it('should succeed on invalid input', () => {
    const withoutArgs = findReferences();
    const nullArgs = findReferences(null);

    expect(withoutArgs).to.be.a('Array').to.have.lengthOf(0);
    expect(nullArgs).to.be.a('Array').have.lengthOf(0);
  });

  it('should return paths', () => {
    const testObject = {
      prop1: 'test',
      array1: [
        {
          prop1: 'hit',
          prop2: 4,
        },
        'hit',
        [
          {
            prop1: null,
            prop2: 'hit',
          },
        ],
      ],
      prop2: {
        prop1: 'foo',
        prop2: {
          prop1: 'hit',
        },
      },
    };

    const expectedResult = [
      'array1[0].prop1',
      'array1[1]',
      'array1[2][0].prop2',
      'prop2.prop2.prop1',
    ];
    const paths = findReferences(testObject, 'hit');

    expect(paths).to.be.a('Array').to.have.lengthOf(4);
    expect(_.every(paths, path => _.includes(expectedResult, path))).to.equal(true);
  });

  it('should not fail with circular references', () => {
    const testObject = {
      prop1: 'test',
      array1: [
        {
          prop1: 'hit',
          prop2: 4,
        },
        'hit',
        [
          {
            prop1: null,
            prop2: 'hit',
          },
        ],
      ],
      prop2: {
        prop1: 'foo',
        prop2: {
          prop1: 'hit',
        },
      },
    };
    testObject.array1.push(testObject.prop2);

    const expectedResult = [
      'array1[0].prop1',
      'array1[1]',
      'array1[2][0].prop2',
      'prop2.prop2.prop1',
    ];
    const paths = findReferences(testObject, 'hit');

    expect(paths).to.be.a('Array').to.have.lengthOf(4);
    expect(_.every(paths, path => _.includes(expectedResult, path))).to.equal(true);
  });
});
