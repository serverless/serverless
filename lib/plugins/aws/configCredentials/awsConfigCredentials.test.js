'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const constants = require('constants');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const path = require('path');
const testUtils = require('../../../../tests/utils');
const AwsConfigCredentials = require('./awsConfigCredentials');
const Serverless = require('../../../Serverless');

describe('AwsConfigCredentials', () => {
  let awsConfigCredentials;
  let credentialsFileContent;
  let credentialsFilePath;
  let serverless;
  let sandbox;
  let tmpDirPath;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    tmpDirPath = testUtils.getTmpDirPath();
    credentialsFilePath = path.join(tmpDirPath, '.aws', 'credentials');
    credentialsFileContent = '[my-profile]\n';
    credentialsFileContent += 'aws_access_key_id = my-old-profile-key\n';
    credentialsFileContent += 'aws_secret_access_key = my-old-profile-secret\n';

    // stub homedir handler to return the tmpDirPath
    sandbox.stub(os, 'homedir').returns(tmpDirPath);

    serverless = new Serverless();
    serverless.init();
    const options = {
      provider: 'aws',
      key: 'some-key',
      secret: 'some-secret',
    };
    awsConfigCredentials = new AwsConfigCredentials(serverless, options);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#constructor()', () => {
    it('should have the command "config"', () => {
      expect(awsConfigCredentials.commands.config).to.not.equal(undefined);
    });

    it('should have the sub-command "credentials"', () => {
      expect(awsConfigCredentials.commands.config.commands.credentials).to.not.equal(undefined);
    });

    it('should have no lifecycle event', () => {
      expect(awsConfigCredentials.commands.config.lifecycleEvents).to.equal(undefined);
    });

    it('should have the lifecycle event "config" for the "credentials" sub-command', () => {
      expect(awsConfigCredentials.commands.config.commands.credentials.lifecycleEvents)
        .to.deep.equal(['config']);
    });

    it('should have the req. options "key" and "secret" for the "credentials" sub-command', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsConfigCredentials.commands.config.commands.credentials.options.key.required)
        .to.be.true;
      // eslint-disable-next-line no-unused-expressions
      expect(awsConfigCredentials.commands.config.commands.credentials.options.secret.required)
        .to.be.true;
    });

    it('should have a "config:credentials:config" hook', () => {
      expect(awsConfigCredentials.hooks['config:credentials:config']).to.not.equal(undefined);
    });

    it('should run promise chain in order for "config:credentials:config" hook', () => {
      const awsConfigCredentialsStub = sinon
        .stub(awsConfigCredentials, 'configureCredentials').resolves();

      return awsConfigCredentials.hooks['config:credentials:config']().then(() => {
        expect(awsConfigCredentialsStub.calledOnce).to.equal(true);

        awsConfigCredentials.configureCredentials.restore();
      });
    });

    it('should throw an error if the home directory was not found', () => {
      os.homedir.returns(null);
      expect(() => new AwsConfigCredentials(serverless, {})).to.throw(Error);
    });

    it('should create the .aws/credentials file if not yet present', () => {
      // remove the .aws directory which was created in the before hook of the test
      const awsDirectoryPath = path.join(tmpDirPath, '.aws');
      fse.removeSync(awsDirectoryPath);

      awsConfigCredentials = new AwsConfigCredentials(serverless, {});
      const isCredentialsFilePresent = fs.existsSync(path.join(awsDirectoryPath, 'credentials'));
      expect(isCredentialsFilePresent).to.equal(true);
    });
  });

  describe('#configureCredentials()', () => {
    it('should lowercase the provider option', () => {
      awsConfigCredentials.options.provider = 'SOMEPROVIDER';

      return awsConfigCredentials.configureCredentials().then(() => {
        expect(awsConfigCredentials.options.provider).to.equal('someprovider');
      });
    });

    it('should use the "default" profile if option is not given', () =>
      awsConfigCredentials.configureCredentials().then(() => {
        expect(awsConfigCredentials.options.profile).to.equal('default');
      })
    );

    it('should resolve if the provider option is not "aws"', (done) => {
      awsConfigCredentials.options.provider = 'invalid-provider';

      awsConfigCredentials.configureCredentials().then(() => done());
    });

    it('should throw an error if the "key" and "secret" options are not given', () => {
      awsConfigCredentials.options.key = false;
      awsConfigCredentials.options.secret = false;

      expect(() => awsConfigCredentials.configureCredentials()).to.throw(Error);
    });

    it('should not update the profile if the overwrite flag is not set', () => {
      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';

      fse.outputFileSync(credentialsFilePath, credentialsFileContent);

      return awsConfigCredentials.configureCredentials();
    });

    it('should update the profile', () => {
      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';
      awsConfigCredentials.options.overwrite = true;

      fse.outputFileSync(credentialsFilePath, credentialsFileContent);

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id = my-new-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key = my-new-profile-secret');
      });
    });

    it('should not alter other profiles when updating a profile', () => {
      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';
      awsConfigCredentials.options.overwrite = true;

      credentialsFileContent += '[my-other-profile]\n';
      credentialsFileContent += 'aws_secret_access_key = my-other-profile-secret\n';

      fse.outputFileSync(credentialsFilePath, credentialsFileContent);

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id = my-new-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key = my-new-profile-secret');
        expect(lineByLineContent[4]).to.equal('aws_secret_access_key = my-other-profile-secret');
      });
    });

    it('should add the missing credentials to the updated profile', () => {
      credentialsFileContent = '[my-profile]\n';
      credentialsFileContent += 'aws_secret_access_key = my-profile-secret\n';

      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';
      awsConfigCredentials.options.overwrite = true;

      fse.outputFileSync(credentialsFilePath, credentialsFileContent);

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id = my-new-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key = my-new-profile-secret');
      });
    });

    it('should append the profile to the credentials file', () => {
      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-profile-key';
      awsConfigCredentials.options.secret = 'my-profile-secret';

      return awsConfigCredentials.configureCredentials().then(() => {
        const UpdatedCredentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = UpdatedCredentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id = my-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key = my-profile-secret');
      });
    });

    if (os.platform() !== 'win32') {
      it('should set the permissions of the credentials file to be owner-only read/write', () =>
        awsConfigCredentials.configureCredentials().then(() => {
          const fileMode = fs.statSync(credentialsFilePath).mode;
          const filePermissions = fileMode & ~(fs.constants || constants).S_IFMT;

          const readableByOwnerPermission = (fs.constants || constants).S_IRUSR;
          const writableByOwnerPermission = (fs.constants || constants).S_IWUSR;
          const expectedFilePermissions = readableByOwnerPermission | writableByOwnerPermission;

          expect(filePermissions).to.equal(expectedFilePermissions);
        })
      );
    }
  });

  describe('#getCredentials()', () => {
    it('should load credentials file and return the credentials lines', () => {
      fse.outputFileSync(credentialsFilePath, credentialsFileContent);
      const credentials = awsConfigCredentials.getCredentials();

      expect(credentials[0]).to.equal('[my-profile]');
      expect(credentials[1]).to.equal('aws_access_key_id = my-old-profile-key');
    });

    it('should return an empty array if the file is empty', () => {
      const credentials = awsConfigCredentials.getCredentials();

      expect(credentials.length).to.equal(0);
    });
  });

  describe('#getProfileBoundaries()', () => {
    it('should return the start and end numbers of the profile', () => {
      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.credentials = [
        '[my-profile]',
        'aws_access_key_id = my-other-profile-key',
      ];

      const profileBoundaries = awsConfigCredentials.getProfileBoundaries();

      expect(profileBoundaries.start).to.equal(0);
      expect(profileBoundaries.end).to.equal(2);
    });

    it('should set the start property to -1 if the profile was not found', () => {
      awsConfigCredentials.options.profile = 'my-not-yet-saved-profile';
      awsConfigCredentials.credentials = [
        '[my-profile]',
        'aws_access_key_id = my-other-profile-key',
      ];

      const profileBoundaries = awsConfigCredentials.getProfileBoundaries();

      expect(profileBoundaries.start).to.equal(-1);
    });

    it('should set the end to the credentials length if no other profile was found', () => {
      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.credentials = [
        '[my-profile]',
        'aws_access_key_id = my-other-profile-key',
        '# a comment',
        'aws_secret_access_key = my-profile-secret',
      ];

      const profileBoundaries = awsConfigCredentials.getProfileBoundaries();

      expect(profileBoundaries.end).to.equal(4);
    });
  });
});
