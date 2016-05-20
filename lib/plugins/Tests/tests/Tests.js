'use strict';

/**
 * Test: Tests Plugin
 */

const expect = require('chai').expect;
const Tests = require('../Tests');
const fs = require('fs');
const path = require('path');

describe('Test', () => {
  let tests;

  beforeEach(() => {
    tests = new Tests();
  });

  describe('#constructor()', () => {
    it('should have commands', () => {
      expect(tests.commands).to.be.not.empty;
    });

    it('should have hooks', () => {
      expect(tests.hooks).to.be.not.empty;
    });
  });

  describe('#createFile()', () => {
    it('should create a file in the plugins root directory', () => {
      const isFileCreated = tests.createFile();

      expect(isFileCreated).to.equal(true);
    });
  });

  // clean up
  after((done) => {
    const filePath = path.join(__dirname, '..', '.integration-test');
    try {
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        done();
      }
    } catch (exception) {
      throw new Error(exception);
    }
  });
});
