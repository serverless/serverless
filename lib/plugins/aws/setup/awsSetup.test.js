'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const BbPromise = require('bluebird');
const fs = require('fs');
const fse = require('fs-extra');
const os = require('os');
const path = require('path');
const testUtils = require('../../../../tests/utils');
const AwsSetup = require('./awsSetup');
const Serverless = require('../../../Serverless');

describe('AwsSetup', () => {
  let awsSetup;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    const options = {
      provider: 'aws',
      key: 'some-key',
      secret: 'some-secret',
    };
    awsSetup = new AwsSetup(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have the command "setup"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.commands.setup).to.not.be.undefined;
    });

    it('should have a lifecycle events "setup"', () => {
      expect(awsSetup.commands.setup.lifecycleEvents).to.deep.equal([
        'setup',
      ]);
    });

    it('should have the required options "key" and "secret"', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.commands.setup.options.key.required).to.be.true;
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.commands.setup.options.secret.required).to.be.true;
    });

    it('should have a "setup:setup" hook', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSetup.hooks['setup:setup']).to.not.be.undefined;
    });

    it('should run promise chain in order for "setup:setup" hook', () => {
      const awsSetupStub = sinon
        .stub(awsSetup, 'setupAws').returns(BbPromise.resolve());

      return awsSetup.hooks['setup:setup']().then(() => {
        expect(awsSetupStub.calledOnce).to.equal(true);

        awsSetup.setupAws.restore();
      });
    });
  });

  describe('#setupAws()', () => {
    let homeDir;
    let credentialsFilePath;

    beforeEach(() => {
      // create a new tmpDir for the homeDir path
      const tmpDirPath = testUtils.getTmpDirPath();
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
      awsSetup.options.provider = 'SOMEPROVIDER';

      return awsSetup.setupAws().then(() => {
        expect(awsSetup.options.provider).to.equal('someprovider');
      });
    });

    it('should use the "default" profile if option is not given', () =>
      awsSetup.setupAws().then(() => {
        expect(awsSetup.options.profile).to.equal('default');
      })
    );

    it('should resolve if the provider option is not "aws"', (done) => {
      awsSetup.options.provider = 'invalid-provider';

      awsSetup.setupAws().then(() => done());
    });

    it('should throw an error if the "key" and "secret" options are not given', () => {
      awsSetup.options.key = false;
      awsSetup.options.secret = false;

      expect(() => awsSetup.setupAws()).to.throw(Error);
    });

    it('should resolve if profile is already given in credentials file', (done) => {
      awsSetup.options.profile = 'my-profile';
      serverless.utils.appendFileSync(credentialsFilePath, '[my-profile]');

      awsSetup.setupAws().then(() => done());
    });

    it('should append the profile to the credentials file', () => {
      awsSetup.options.profile = 'my-profile';
      awsSetup.options.key = 'my-profile-key';
      awsSetup.options.secret = 'my-profile-secret';

      awsSetup.setupAws().then(() => {
        const credentialsFileContent = fs.readFileSync(credentialsFilePath).toString();
        const lineByLineContent = credentialsFileContent.split('\n');

        expect(lineByLineContent[0]).to.equal('[my-profile]');
        expect(lineByLineContent[1]).to.equal('aws_access_key_id=my-profile-key');
        expect(lineByLineContent[2]).to.equal('aws_secret_access_key=my-profile-secret');
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
