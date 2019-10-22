'use strict';

const { expect } = require('chai');

const isTabtabCompletionSuported = require('../isTrackingDisabled');

describe('isTabtabCompletionSuported', () => {
  it('Should resolve boolean', () => expect(typeof isTabtabCompletionSuported).to.equal('boolean'));
});
