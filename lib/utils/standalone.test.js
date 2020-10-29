'use strict';

const { expect } = require('chai');
const standalone = require('./standalone');

describe('#standalone', () => {
  it('Should resolve standalone url', () =>
    expect(standalone.resolveUrl('v2.8.0')).to.match(/^https:\/\//));
});
