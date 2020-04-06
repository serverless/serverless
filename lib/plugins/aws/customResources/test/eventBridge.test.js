'use strict';

const { expect } = require('chai');
const { getEventBusTargetId } = require('../resources/eventBridge/lib/utils');

describe('#getEventBusTargetId()', () => {
  const assertions = [
    { ruleName: 'some-function-name-rule-1' },
    { ruleName: 'some-very-very-very-long-and-complicated-function-name-rule-1' },
  ];

  assertions.forEach(({ ruleName }) => {
    it(`should append "target" suffix on ${ruleName} and ensure output targetId length is less than or equal 64`, () => {
      const targetId = getEventBusTargetId(ruleName);

      expect(targetId.endsWith('target')).to.be.true;
      expect(targetId).lengthOf.lte(64);
    });
  });
});
