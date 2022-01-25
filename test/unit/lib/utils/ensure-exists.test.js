'use strict';

const chai = require('chai');
const sinon = require('sinon');

const ensureExists = require('../../../../lib/utils/ensure-exists');
const { getTmpDirPath } = require('../../../utils/fs');

const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');

const expect = chai.expect;
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

describe('test/unit/lib/utils/ensureExists.test.js', () => {
  const testCacheDir = getTmpDirPath();

  it('Should call generate if file missing', async () => {
    const testFileName = `test-${crypto.randomBytes(2).toString('hex')}`;
    const generateStub = sinon.stub().resolves();
    await ensureExists(path.resolve(testCacheDir, testFileName), generateStub);
    expect(generateStub.calledOnce).to.be.true;
  });

  it('Should not call generate if file exists', async () => {
    const testFileName = `test-${crypto.randomBytes(2).toString('hex')}`;
    await fsp.writeFile(path.resolve(testCacheDir, testFileName), '');
    const generateStub = sinon.stub().resolves();
    await ensureExists(path.resolve(testCacheDir, testFileName), generateStub);
    expect(generateStub.calledOnce).to.be.false;
  });
});
