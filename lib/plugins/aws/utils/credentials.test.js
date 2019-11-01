'use strict';

const expect = require('chai').expect;
const BbPromise = require('bluebird');
const os = require('os');
const path = require('path');
const { outputFile, lstatAsync: lstat, removeAsync: rmDir } = BbPromise.promisifyAll(
  require('fs-extra')
);
const overrideEnv = require('process-utils/override-env');
const credentials = require('./credentials');

describe('#credentials', () => {
  const credentialsDirPath = path.join(os.homedir(), '.aws');
  const credentialsFilePath = path.join(credentialsDirPath, 'credentials');

  before(() => {
    // Abort if credentials are found in home directory
    // (it should not be the case, as home directory is mocked to point temp dir)
    return lstat(credentialsDirPath).then(
      () => {
        throw new Error('Unexpected ~/.aws directory, related tests aborted');
      },
      error => {
        if (error.code === 'ENOENT') return;
        throw error;
      }
    );
  });

  afterEach(() => rmDir(credentialsDirPath));

  it('should resolve file profiles', () => {
    const profiles = new Map([
      [
        'my-profile1',
        {
          accessKeyId: 'my-old-profile-key1',
          secretAccessKey: 'my-old-profile-secret1',
        },
      ],
      [
        'my-profile2',
        {
          accessKeyId: 'my-old-profile-key2',
          secretAccessKey: 'my-old-profile-secret2',
        },
      ],
    ]);

    const [[profile1Name, profile1], [profile2Name, profile2]] = Array.from(profiles);
    const credentialsFileContent = `${[
      `[${[profile1Name]}]`,
      `aws_access_key_id = ${profile1.accessKeyId}`,
      `aws_secret_access_key = ${profile1.secretAccessKey}`,
      '',
      `[${[profile2Name]}]`,
      `aws_access_key_id = ${profile2.accessKeyId}`,
      `aws_secret_access_key = ${profile2.secretAccessKey}`,
    ].join('\n')}\n`;

    return new BbPromise((resolve, reject) => {
      outputFile(credentialsFilePath, credentialsFileContent, error => {
        if (error) reject(error);
        else resolve();
      });
    }).then(() =>
      credentials
        .resolveFileProfiles()
        .then(resolvedProfiles => expect(resolvedProfiles).to.deep.equal(profiles))
    );
  });

  it('should resolve env credentials', () =>
    overrideEnv(() => {
      process.env.AWS_ACCESS_KEY_ID = 'foo';
      process.env.AWS_SECRET_ACCESS_KEY = 'bar';
      expect(credentials.resolveEnvCredentials()).to.deep.equal({
        accessKeyId: 'foo',
        secretAccessKey: 'bar',
      });
    }));

  it('should save file profiles', () => {
    const profiles = new Map([
      [
        'my-profileA',
        {
          accessKeyId: 'my-old-profile-key1',
          secretAccessKey: 'my-old-profile-secret1',
        },
      ],
      [
        'my-profileB',
        {
          accessKeyId: 'my-old-profile-key2',
          secretAccessKey: 'my-old-profile-secret2',
        },
      ],
    ]);

    return credentials
      .saveFileProfiles(profiles)
      .then(() =>
        credentials
          .resolveFileProfiles()
          .then(resolvedProfiles => expect(resolvedProfiles).to.deep.equal(profiles))
      );
  });
});
