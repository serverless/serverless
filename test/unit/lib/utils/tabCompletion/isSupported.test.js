'use strict';

const { expect } = require('chai');

const isSuported = require('../../../../../lib/utils/tabCompletion/isSupported');

describe('isTabtabCompletionSuported', () => {
  it('Should resolve boolean', () => expect(typeof isSuported).to.equal('boolean'));
});
