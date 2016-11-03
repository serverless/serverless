'use strict';

const path = require('path');
const expect = require('chai').expect;
const execSync = require('child_process').execSync;

const Utils = require('../../../utils/index');

describe('General: Local plugins test', function () {
  this.timeout(0);

  before(() => {
    Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
  });

  it('should successfully run the one command', () => {
    const pluginExecution = execSync(`${Utils.serverlessExec} one`);
    const result = new Buffer(pluginExecution, 'base64').toString();
    expect(/plugin one ran successfully/g.test(result)).to.equal(true);
  });

  it('should successfully run the two command', () => {
    const pluginExecution = execSync(`${Utils.serverlessExec} two`);
    const result = new Buffer(pluginExecution, 'base64').toString();
    expect(/plugin two ran successfully/g.test(result)).to.equal(true);
  });
});
