'use strict';

const AwsDeploy = require('../awsDeploy');
const Serverless = require('../../../Serverless');

const awsDeploy = new AwsDeploy();

describe('test', () => {
  it('test case', () => {
    awsDeploy.deployCore();
  });
});
