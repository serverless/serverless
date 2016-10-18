'use strict';

const path = require('path');
const expect = require('chai').expect;
const execSync = require('child_process').execSync;

const Utils = require('../../../utils/index');

describe('General: Custom plugins test', function () {
  this.timeout(0);

  before(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));

    // cd into the plugins directory
    execSync('cd serverless-plugin-greeter');

    // link and install the npm package / plugin
    execSync('npm link serverless-plugin-greeter && npm install --save serverless-plugin-greeter');

    // cd back into the service directory
    execSync('cd ..');
  });

  it('should successfully run the greet command of the custom plugin', () => {
    const pluginExecution = execSync(`${Utils.serverlessExec} greet`);

    // note: the result will return a newline at the end
    const result = new Buffer(pluginExecution, 'base64').toString();

    expect(result).to.equal('Hello from the greeter plugin!');
  });

  after(() => {
    // unlink the npm package
    execSync('npm r serverless-plugin-greeter -g');
  });
});
