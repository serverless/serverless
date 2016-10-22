'use strict';

const path = require('path');
const expect = require('chai').expect;
const Utils = require('../../../../utils/index');
const BbPromise = require('bluebird');

describe('AWS - Schedule: Multiple schedules with multiple functions', function () {
  this.timeout(0);

  before(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should trigger functions every minute', () => BbPromise.resolve()
    .delay(100000)
    .then(() => {
      const helloLogs = Utils.getFunctionLogs('hello');
      const worldLogs = Utils.getFunctionLogs('world');

      expect(/Scheduled Event/g.test(helloLogs)).to.equal(true);
      expect(/aws\.events/g.test(helloLogs)).to.equal(true);
      expect(/Scheduled Event/g.test(worldLogs)).to.equal(true);
      expect(/aws\.events/g.test(worldLogs)).to.equal(true);
    })
  );

  after(() => {
    Utils.removeService();
  });
});
