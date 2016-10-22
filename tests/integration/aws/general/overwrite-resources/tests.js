'use strict';

const path = require('path');
const expect = require('chai').expect;
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');

const Utils = require('../../../../utils/index');

const Lambda = new AWS.Lambda({ region: 'us-east-1' });
BbPromise.promisifyAll(Lambda, { suffix: 'Promised' });

describe('AWS - General: Overwrite resources test', function () {
  this.timeout(0);

  let stackName;

  before(() => {
    stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should overwrite timeout config for hello function', () => {
    const helloFunctionName = `${stackName}-hello`;
    return Lambda.getFunctionPromised({ FunctionName: helloFunctionName })
      .then(data => {
        const timeout = data.Configuration.Timeout;
        expect(timeout).to.equal(10);
      });
  });

  it('should NOT overwrite timeout config for world function', () => {
    const worldFunctionName = `${stackName}-world`;
    return Lambda.getFunctionPromised({ FunctionName: worldFunctionName })
      .then(data => {
        const timeout = data.Configuration.Timeout;
        expect(timeout).to.equal(6);
      });
  });

  after(() => {
    Utils.removeService();
  });
});
