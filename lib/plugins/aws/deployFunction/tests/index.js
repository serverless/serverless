'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const Package = require('../../../package');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeployFunction = require('../index');
const Serverless = require('../../../../Serverless');
const BbPromise = require('bluebird');
const testUtils = require('../../../../../tests/utils');

describe('AwsDeployFunction', () => {
  let serverless;
  let awsDeployFunction;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.servicePath = true;
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };
    serverless.service.functions = {
      first: {
        handler: true,
        name: 'first-hello',
      },
    };
    const options = {
      stage: 'dev',
      region: 'us-east-1',
      function: 'first',
      backup: true,
      functionObj: {
        name: 'first',
      },
    };
    serverless.init();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsDeployFunction = new AwsDeployFunction(serverless, options);
  });

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsDeployFunction.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsDeployFunction.provider).to.be.instanceof(AwsProvider));

    it('should set an empty options object if no options are given', () => {
      const awsDeployFunctionWithEmptyOptions = new AwsDeployFunction(serverless);

      expect(awsDeployFunctionWithEmptyOptions.options).to.deep.equal({});
    });

    it('should run "deploy:function:deploy" promise chain in order', () => {
      const validateStub = sinon
        .stub(awsDeployFunction, 'validate').returns(BbPromise.resolve());
      const checkIfFunctionExistsStub = sinon
        .stub(awsDeployFunction, 'checkIfFunctionExists').returns(BbPromise.resolve());
      const zipFunctionStub = sinon
        .stub(awsDeployFunction, 'zipFunction').returns(BbPromise.resolve());
      const deployFunctionStub = sinon
        .stub(awsDeployFunction, 'deployFunction').returns(BbPromise.resolve());
      const cleanupStub = sinon
        .stub(awsDeployFunction, 'cleanup').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['deploy:function:deploy']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(checkIfFunctionExistsStub.calledAfter(validateStub))
          .to.equal(true);
        expect(zipFunctionStub.calledAfter(checkIfFunctionExistsStub))
          .to.equal(true);
        expect(deployFunctionStub.calledAfter(zipFunctionStub))
          .to.equal(true);
        expect(cleanupStub.calledAfter(deployFunctionStub))
          .to.equal(true);

        awsDeployFunction.validate.restore();
        awsDeployFunction.checkIfFunctionExists.restore();
        awsDeployFunction.zipFunction.restore();
        awsDeployFunction.deployFunction.restore();
        awsDeployFunction.cleanup.restore();
      });
    });

    it('should run "before:deploy:function:deploy" promise chain in order', () => {
      const validateStub = sinon
        .stub(awsDeployFunction, 'validate').returns(BbPromise.resolve());
      const publishVersionStub = sinon
        .stub(awsDeployFunction, 'publishVersion').returns(BbPromise.resolve());
      const setAliasStub = sinon
        .stub(awsDeployFunction, 'setAlias').returns(BbPromise.resolve());

      return awsDeployFunction.hooks['before:deploy:function:deploy']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(publishVersionStub.calledAfter(validateStub))
          .to.equal(true);
        expect(setAliasStub.calledAfter(publishVersionStub))
          .to.equal(true);

        awsDeployFunction.validate.restore();
        awsDeployFunction.publishVersion.restore();
        awsDeployFunction.setAlias.restore();
      });
    });
  });

  describe('#checkIfFunctionExists()', () => {
    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsDeployFunction.checkIfFunctionExists()).to.throw(Error);
    });

    it('should check if the function is deployed', () => {
      const getFunctionStub = sinon
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());

      awsDeployFunction.serverless.service.functions = {
        first: {
          name: 'first',
          handler: 'handler.first',
        },
      };

      return awsDeployFunction.checkIfFunctionExists().then(() => {
        expect(getFunctionStub.calledOnce).to.be.equal(true);
        expect(getFunctionStub.calledWithExactly(
          'Lambda',
          'getFunction',
          {
            FunctionName: 'first',
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });
  });

  describe('#zipFunction()', () => {
    it('should zip the function', () => {
      const pkg = new Package();

      awsDeployFunction.pkg = pkg;

      const packageFunctionStub = sinon
        .stub(pkg, 'packageFunction').returns(BbPromise.resolve());

      return awsDeployFunction.zipFunction().then(() => {
        expect(packageFunctionStub.calledOnce).to.be.equal(true);
        expect(packageFunctionStub.args[0][0]).to.be.equal(awsDeployFunction.options.function);

        awsDeployFunction.pkg.packageFunction.restore();
      });
    });
  });

  describe('#deployFunction()', () => {
    let artifactFilePath;

    beforeEach(() => {
      // write a file to disc to simulate that the deployment artifact exists
      artifactFilePath = path.join(testUtils.getTmpDirPath(), 'artifact.zip');
      serverless.utils.writeFileSync(artifactFilePath, 'artifact.zip file content');

      awsDeployFunction.options.functionObj.artifact = artifactFilePath;
    });

    it('should deploy the function', () => {
      // deploy the function artifact not the service artifact
      const updateFunctionCodeStub = sinon
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());

      return awsDeployFunction.deployFunction().then(() => {
        const data = fs.readFileSync(artifactFilePath);

        expect(updateFunctionCodeStub.calledOnce).to.be.equal(true);
        expect(updateFunctionCodeStub.calledWithExactly(
          'Lambda',
          'updateFunctionCode',
          {
            FunctionName: 'first',
            ZipFile: data,
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });

    it('should log artifact size', () => {
      sinon.stub(fs, 'statSync').returns({ size: 1024 });
      sinon.stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());
      sinon.spy(awsDeployFunction.serverless.cli, 'log');

      return awsDeployFunction.deployFunction().then(() => {
        const expected = 'Uploading function: first (1 KB)…';
        expect(awsDeployFunction.serverless.cli.log.calledWithExactly(expected)).to.be.equal(true);

        awsDeployFunction.provider.request.restore();
        fs.statSync.restore();
      });
    });
  });

  describe('#cleanup()', () => {
    it('should remove the temporary .serverless directory', () => {
      const pkg = new Package();

      awsDeployFunction.pkg = pkg;

      const cleanupStub = sinon
        .stub(pkg, 'cleanup').returns(BbPromise.resolve());

      return awsDeployFunction.cleanup().then(() => {
        expect(cleanupStub.calledOnce).to.be.equal(true);
        awsDeployFunction.pkg.cleanup.restore();
      });
    });
  });

  describe('#publishVersion()', () => {
    it('should not do anything', () => {
      awsDeployFunction.options.backup = false;
      return awsDeployFunction.publishVersion();
    });

    it('should publish a new version', () => {
      const publishVersionStub = sinon
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve({ Version: 10 }));

      return awsDeployFunction.publishVersion().then(() => {
        expect(publishVersionStub.calledOnce).to.be.equal(true);
        expect(publishVersionStub.calledWithExactly(
          'Lambda',
          'publishVersion',
          {
            FunctionName: 'first-hello',
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });
  });

  describe('#setAlias()', () => {
    it('should not do anything', () => {
      awsDeployFunction.options.backup = false;
      return awsDeployFunction.publishVersion();
    });

    it('should update the alias', () => {
      const setAliasStub = sinon
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());

      awsDeployFunction.newVersion = {
        Version: 10,
      };

      return awsDeployFunction.setAlias().then(() => {
        expect(setAliasStub.calledOnce).to.be.equal(true);
        expect(setAliasStub.calledWithExactly(
          'Lambda',
          'updateAlias',
          {
            FunctionName: 'first-hello',
            Name: 'first-hello-rollback',
            FunctionVersion: 10,
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });

    it('should create the alias', () => {
      const setAliasStub = sinon
        .stub(awsDeployFunction.provider, 'request').returns(BbPromise.resolve());

      setAliasStub.withArgs(
        'Lambda',
        'updateAlias',
        {
          FunctionName: 'first-hello',
          Name: 'first-hello-rollback',
          FunctionVersion: 10,
        },
        awsDeployFunction.options.stage,
        awsDeployFunction.options.region)
      .returns(BbPromise.reject(new Error('test')));

      awsDeployFunction.newVersion = {
        Version: 10,
      };

      return awsDeployFunction.setAlias().then(() => {
        expect(setAliasStub.calledTwice).to.be.equal(true);
        expect(setAliasStub.calledWithExactly(
          'Lambda',
          'createAlias',
          {
            FunctionName: 'first-hello',
            Name: 'first-hello-rollback',
            FunctionVersion: 10,
          },
          awsDeployFunction.options.stage,
          awsDeployFunction.options.region
        )).to.be.equal(true);
        awsDeployFunction.provider.request.restore();
      });
    });
  });
});
