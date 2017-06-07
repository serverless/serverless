'use strict';

const path = require('path');
const expect = require('chai').expect;
const AWS = require('aws-sdk');
const BbPromise = require('bluebird');

const Utils = require('../../../../utils/index');

const Lambda = new AWS.Lambda({ region: 'us-east-1' });
BbPromise.promisifyAll(Lambda, { suffix: 'Promised' });

describe('AWS - General: Xray tracing test', () => {
  let stackName;

  beforeAll(() => {
    stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should enable active X-Ray tracing', () => {
    const helloFunctionName = `${stackName}-hello`;
    return Lambda.getFunctionPromised({ FunctionName: helloFunctionName })
      .then(data => {
        const tracingConfig = data.Configuration.TracingConfig;
        expect(tracingConfig).to.be.an('object');
        expect(tracingConfig.Mode).to.equal('Active');
      });
  });

  afterAll(() => {
    Utils.removeService();
  });
});
