'use strict';

const chai = require('chai');
const path = require('path');
const runServerless = require('../../../../utils/run-serverless');
const { getTmpDirPath } = require('../../../../utils/fs');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('#validate', () => {
  it('should throw error if the package path includes service', () => {
    expect(
      runServerless({
        fixture: 'function',
        command: 'package',
        options: {
          package: path.dirname(getTmpDirPath()),
        },
      })
    ).to.be.eventually.rejected.and.have.property('code', 'INVALID_PACKAGE_ARTIFACT_PATH');
  });
});
