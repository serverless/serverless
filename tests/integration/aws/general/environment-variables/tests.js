'use strict';

const path = require('path');
const expect = require('chai').expect;
const execSync = require('child_process').execSync;

const Utils = require('../../../../utils/index');

describe('AWS - General: Environment variables test', () => {
  beforeAll(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
    Utils.deployService();
  });

  it('should expose environment variables', () => {
    const invoked = execSync(`${Utils.serverlessExec} invoke --function hello --noGreeting true`);

    const result = JSON.parse(new Buffer(invoked, 'base64').toString());

    expect(result.environment_variables.provider_level_variable_1)
      .to.be.equal('provider_level_1');
    expect(result.environment_variables.function_level_variable_1)
      .to.be.equal('function_level_1');
    expect(result.environment_variables.function_level_variable_2)
      .to.be.equal('function_level_2');
    expect(result.environment_variables.provider_level_variable_2)
      .to.be.equal('overwritten_by_function');
  });

  afterAll(() => {
    Utils.removeService();
  });
});
