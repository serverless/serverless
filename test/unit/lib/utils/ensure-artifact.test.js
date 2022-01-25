'use strict';

const { expect } = require('chai');

const ensureArtifact = require('../../../../lib/utils/ensure-artifact');

const path = require('path');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const crypto = require('crypto');

describe('#ensureArtifact', () => {
  const testArtifactName = `test-${crypto.randomBytes(2).toString('hex')}`;

  let testArtifactPath;
  let invokedCount = 0;

  const generateFunc = async (cachePath) => {
    testArtifactPath = path.resolve(cachePath, testArtifactName);
    ++invokedCount;
    await fsp.writeFile(testArtifactPath, '');
  };

  it('Should generate artifact if missing', async () => {
    await ensureArtifact(testArtifactName, generateFunc);
    const exists = await fse.pathExists(testArtifactPath);
    expect(exists).to.be.true;
  });

  it('Should generate only on first access', async () => {
    await ensureArtifact(testArtifactName, generateFunc);
    expect(invokedCount).to.equal(1);
  });

  it('Should not generate, if generated in past', async () => {
    ensureArtifact.delete(testArtifactName);
    await ensureArtifact(testArtifactName, generateFunc);
    expect(invokedCount).to.equal(1);
  });

  it('Should return cache path', async () => {
    const cachePath = await ensureArtifact(testArtifactName, generateFunc);
    expect(cachePath).to.include(`.serverless${path.sep}artifacts`);
  });
});
