'use strict';

const chai = require('chai');
const overrideEnv = require('process-utils/override-env');
const requireUncached = require('ncjsm/require-uncached');
const path = require('path');
const fse = require('fs-extra');

const { expect } = chai;

describe('test/unit/lib/aws/has-local-credentials.test.js', () => {
  const accessKeyId = 'AKIAIOSFODNN7EXAMPLE';
  const secretAccessKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

  describe('In environment credentials', () => {
    let restoreEnv;
    let uncachedHasLocalCredentials;

    before(() => {
      ({ restoreEnv } = overrideEnv({ asCopy: true }));
      process.env.AWS_ACCESS_KEY_ID = accessKeyId;
      process.env.AWS_SECRET_ACCESS_KEY = secretAccessKey;
      uncachedHasLocalCredentials = requireUncached(() =>
        require('../../../../lib/aws/has-local-credentials')
      );
    });

    after(() => restoreEnv);

    it('Should properly detect credentials', () => {
      expect(uncachedHasLocalCredentials()).to.equal(true);
    });
  });

  describe('With profile in `.aws`', () => {
    let credentialsDirPath;
    let credentialsFilePath;
    let uncachedHasLocalCredentials;

    before(async () => {
      credentialsDirPath = path.resolve('.aws');
      credentialsFilePath = path.join(credentialsDirPath, 'credentials');
      await fse.outputFile(
        credentialsFilePath,
        [
          '[default]',
          `aws_access_key_id = ${accessKeyId}`,
          `aws_secret_access_key = ${secretAccessKey}`,
        ].join('\n')
      );
      uncachedHasLocalCredentials = requireUncached(() =>
        require('../../../../lib/aws/has-local-credentials')
      );
    });

    after(async () => fse.remove(credentialsDirPath));

    it('Should properly detect credentials', () => {
      expect(uncachedHasLocalCredentials()).to.equal(true);
    });
  });

  describe('Without credentials in `.aws` or in env', () => {
    let restoreEnv;
    let uncachedHasLocalCredentials;

    before(() => {
      ({ restoreEnv } = overrideEnv({ asCopy: true }));
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      uncachedHasLocalCredentials = requireUncached(() =>
        require('../../../../lib/aws/has-local-credentials')
      );
    });

    after(() => restoreEnv);

    it('Should properly report lack of credentials', () => {
      expect(uncachedHasLocalCredentials()).to.equal(false);
    });
  });
});
