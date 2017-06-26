'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const path = require('path');
const testUtils = require('../../../../tests/utils');
const AwsConfigCredentials = require('./awsConfigCredentials');
const Serverless = require('../../../Serverless');

describe('AwsConfigCredentials', () => {
  let awsConfigCredentials;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    const options = {
      provider: 'aws',
      key: 'some-key',
      secret: 'some-secret',
    };
    awsConfigCredentials = new AwsConfigCredentials(serverless, options);
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
  });

  describe('#configureCredentials()', () => {
    let homeDir;
    let tmpDirPath;
    let credentialsFilePath;

    beforeEach(() => {
      // create a new tmpDir for the homeDir path
      tmpDirPath = testUtils.getTmpDirPath();
      fse.mkdirsSync(tmpDirPath);

      // create the .aws/credetials directory and file
      credentialsFilePath = path.join(tmpDirPath, '.aws', 'credentials');
      fse.ensureFileSync(credentialsFilePath);

      // save the homeDir so that we can reset this later on
      homeDir = os.homedir();
      process.env.HOME = tmpDirPath;
      process.env.HOMEPATH = tmpDirPath;
      process.env.USERPROFILE = tmpDirPath;
    });

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
      let credentialsFile = '[my-profile]\n';
      credentialsFile += 'aws_access_key_id = my-old-profile-key\n';
      credentialsFile += 'aws_secret_access_key = my-old-profile-secret\n';

      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';

      serverless.utils.appendFileSync(credentialsFilePath, credentialsFile);

      return awsConfigCredentials.configureCredentials();
    });

    it('should update the profile', () => {

      let credentialsFile = '[my-profile]\n';
      credentialsFile += 'aws_access_key_id = my-old-profile-key\n';
      credentialsFile += 'aws_secret_access_key = my-old-profile-secret\n';

      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';
      awsConfigCredentials.options.overwrite = true;

      serverless.utils.appendFileSync(credentialsFilePath, credentialsFile);

      return awsConfigCredentials.configureCredentials().then(() => {
        const credentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = credentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id = my-new-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key = my-new-profile-secret');

      });
    });

    it('should not alter other profiles when updating a profile', () => {

      let credentialsFile = '[my-profile]\n';
      credentialsFile += 'aws_access_key_id = my-old-profile-key\n';
      credentialsFile += 'aws_secret_access_key = my-old-profile-secret\n';
      credentialsFile += '[my-other-profile]\n';
      credentialsFile += 'aws_secret_access_key = my-other-profile-secret\n';

      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';
      awsConfigCredentials.options.overwrite = true;

      serverless.utils.appendFileSync(credentialsFilePath, credentialsFile);

      return awsConfigCredentials.configureCredentials().then(() => {
        const credentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = credentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id = my-new-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key = my-new-profile-secret');
        expect(lineByLineContent[4]).to.equal('aws_secret_access_key = my-other-profile-secret');

      });
    });

    it('should add the missing credentials to the updated profile', () => {

      let credentialsFile = '[my-profile]\n';
      credentialsFile += 'aws_access_key_id = my-old-profile-key\n';

      awsConfigCredentials.options.profile = 'my-profile';
      awsConfigCredentials.options.key = 'my-new-profile-key';
      awsConfigCredentials.options.secret = 'my-new-profile-secret';
      awsConfigCredentials.options.overwrite = true;

      serverless.utils.appendFileSync(credentialsFilePath, credentialsFile);

      return awsConfigCredentials.configureCredentials().then(() => {
        const credentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = credentialsFileContent.split('\n');

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
        const credentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = credentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id=my-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key=my-profile-secret');
      });
    });

    it('should create the .aws/credentials file if not yet present', () => {
      // remove the .aws directory which was created in the before hook of the test
      const awsDirectoryPath = path.join(tmpDirPath, '.aws');
      fse.removeSync(awsDirectoryPath);

      return awsConfigCredentials.configureCredentials().then(() => {
        const isCredentialsFilePresent = fs.existsSync(path.join(awsDirectoryPath, 'credentials'));

        expect(isCredentialsFilePresent).to.equal(true);
      });
    });

    afterEach(() => {
      // recover the homeDir
      process.env.HOME = homeDir;
      process.env.HOMEPATH = homeDir;
      process.env.USERPROFILE = homeDir;
    });
  });
});
