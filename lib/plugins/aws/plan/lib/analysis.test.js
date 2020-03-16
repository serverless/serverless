// Copyright (c) 2017 Sami Jaktholm <sjakthol@outlook.com>
'use strict';
/* eslint-env mocha */
const chai = require('chai');
const analysis = require('./analysis');

const expect = chai.expect;

describe('AWSPlan analysis module', () => {
  describe('generateKeyValueChanges()', () => {
    const cases = [
      {
        desc: 'empty objects',
        input: {
          prev: {},
          next: {},
        },
        output: {
          added: [],
          removed: [],
          modified: [],
        },
      },
      {
        desc: 'new properties',
        input: {
          prev: {},
          next: { test: 123 },
        },
        output: {
          added: [{ Key: 'test', Value: 123 }],
          removed: [],
          modified: [],
        },
      },
      {
        desc: 'removed properties',
        input: {
          prev: { test: 123 },
          next: {},
        },
        output: {
          added: [],
          removed: [{ Key: 'test', Value: 123 }],
          modified: [],
        },
      },
      {
        desc: 'modified properties',
        input: {
          prev: { a: 123 },
          next: { a: 456 },
        },
        output: {
          added: [],
          removed: [],
          modified: [{ Key: 'a', Value: 456, OldValue: 123 }],
        },
      },
      {
        desc: 'unchanged properties',
        input: {
          prev: { a: 123 },
          next: { a: 123 },
        },
        output: {
          added: [],
          removed: [],
          modified: [],
        },
      },
    ];

    cases.forEach(test => {
      it(`should handle ${test.desc}`, () => {
        expect(analysis.generateKeyValueChanges(test.input.prev, test.input.next)).to.deep.equal(
          test.output
        );
      });
    });
  });
});
