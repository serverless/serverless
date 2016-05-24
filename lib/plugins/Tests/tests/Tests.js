'use strict';

/**
 * Test: Tests Plugin
 */

const expect = require('chai').expect;
const Tests = require('../Tests');
const TestsPlugin = require('../Tests');
const exec = require('child_process').exec;
const path = require('path');

describe('Test', () => {
  let tests;

  beforeEach(() => {
    tests = new Tests();
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(tests.commands).to.be.not.empty);

    it('should have hooks', () => expect(tests.hooks).to.be.not.empty);
  });

  describe('#logItselfOnTerminal()', (done) => {
    const testsPlugin = new TestsPlugin();

    const execute = (command, callback) => {
      exec(command, (error, stdout, stderr) => {
        if (stderr) {
          throw new Error(stderr);
        }
        callback(stdout);
      });
    };

    execute(`${path.join(process.env.PWD, '..', '..', '..', 'bin', 'serverless')} test integration`,
      (consoleOutput) => {
        const commands = JSON.parse(consoleOutput);
        expect(commands).to.deep.equal(testsPlugin.commands);
        done();
      });
  });
});
