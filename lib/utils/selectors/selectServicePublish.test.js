'use strict';

const expect = require('chai').expect;
const selectServicePublish = require('./selectServicePublish');

describe('#selectServicePublish()', () => {
  it('should return the publish value of the service object', () => {
    const service = {
      serviceObject: {
        publish: true,
      },
    };

    const result = selectServicePublish(service);

    expect(result).to.equal(true);
  });
});
