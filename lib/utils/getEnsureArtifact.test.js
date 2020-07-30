'use strict';

const { expect } = require('chai');

const getEnsureArtifact = require('./getEnsureArtifact');

const path = require('path');
const fse = require('fs-extra');
const crypto = require('crypto');

describe('#getEnsureArtifact', () => {
  const testArtifactName = `test-${crypto.randomBytes(2).toString('hex')}`;

  let testArtifactPath;
  let ensureArtifact;
  let invokedCount = 0;

  before(() => {
    ensureArtifact = getEnsureArtifact(testArtifactName, cachePath => {
      testArtifactPath = path.resolve(cachePath, testArtifactName);
      ++invokedCount;
      return fse.writeFile(testArtifactPath, '');
    });
  });

  it('Should not generate on ensure function initialization', () =>
    fse.pathExists(testArtifactPath).then(exists => expect(exists).to.be.false));

  it('Should generate artifact if missing', () =>
    ensureArtifact().then(() =>
      fse.pathExists(testArtifactPath).then(exists => expect(exists).to.be.true)
    ));

  it('Should generate only on first access', () =>
    ensureArtifact().then(() => expect(invokedCount).to.equal(1)));

  it('Should not generate, if generated in past', () => {
    getEnsureArtifact._ensureArtifact.delete(testArtifactName);
    return ensureArtifact().then(() => expect(invokedCount).to.equal(1));
  });

  it('Should return cache path', () =>
    ensureArtifact().then(cachePath =>
      expect(cachePath).to.include(`.serverless${path.sep}artifacts`)
    ));
});
