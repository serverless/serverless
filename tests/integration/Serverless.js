'use strict';

/**
 * Test: Serverless Integration
 */

const expect = require('chai').expect;
const exec = require('child_process').exec;
const path = require('path');
const TestsPlugin = require('../../lib/plugins/tests/tests');

describe('Serverless integration tests', () => {
  it('should successfully run the "serverless test integration" command', (done) => {
    const testsPlugin = new TestsPlugin();

    const execute = (command, callback) => {
      exec(command, (error, stdout, stderr) => {
        if (stderr) {
          throw new Error(stderr);
        }
        callback(stdout);
      });
    };

    execute(`${path
      .join(process.env.PWD, 'bin', 'serverless')} test integration --serverless-integration-test`,
        (consoleOutput) => {
          const commands = JSON.parse(consoleOutput);
          expect(commands).to.deep.equal(testsPlugin.commands);
          done();
        });
  });
});
