'use strict';

/**
 * Test: Serverless Integration
 */

const expect = require('chai').expect;
const suppose = require('suppose');
const fs = require('fs');
const path = require('path');

describe('Serverless integration tests', () => {
  it('should successfully run the "serverless test integration" command', (done) => {
    suppose(`${process.env.PWD}/bin/serverless`, ['test', 'integration'])
      .on('error', (error) => {
        throw new Error(error.message);
      })
      .end((code) => {
        if (code === 0) {
          const filePath = path.join(process.env.PWD,
            'lib', 'plugins', 'Tests', '.integration-test');
          expect(fs.statSync(filePath).isFile()).to.equal(true);
          done();
        } else {
          throw new Error('Test failed');
        }
      });
  });

  // clean up
  after((done) => {
    const filePath = path.join(process.env.PWD, 'lib', 'plugins', 'Tests', '.integration-test');
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
