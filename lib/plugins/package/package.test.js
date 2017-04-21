'use strict';

const expect = require('chai').expect;
const Package = require('./package');
const Serverless = require('../../../lib/Serverless');
const sinon = require('sinon');

describe('Package', () => {
  let serverless;
  let options;
  let pkg;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    pkg = new Package(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      expect(pkg.serverless).to.equal(serverless);
    });

    it('should set the options', () => {
      expect(pkg.options).to.equal(options);
    });

    it('should have commands', () => expect(pkg.commands).to.be.not.empty);

    it('should have hooks', () => expect(pkg.hooks).to.be.not.empty);
  });

  describe('hooks', () => {
    let packageServiceStub;
    let packageFunctionStub;

    beforeEach(() => {
      packageServiceStub = sinon.stub(pkg, 'packageService');
      packageFunctionStub = sinon.stub(pkg, 'packageFunction');
    });

    afterEach(() => {
      pkg.packageService.restore();
      pkg.packageFunction.restore();
    });

    it('should implement the package:createDeploymentArtifacts event',
      () => expect(pkg.hooks).to.have.property('package:createDeploymentArtifacts'));

    it('should implement the package:function:package event',
      () => expect(pkg.hooks).to.have.property('package:function:package'));

    describe('package:createDeploymentArtifacts', () => {
      it('should call packageService', () => pkg.hooks['package:createDeploymentArtifacts']()
        .then(() => {
          expect(packageServiceStub.calledOnce).to.equal(true);
        })
      );
    });

    describe('package:function:package', () => {
      it('should call packageFunction', () => {
        pkg.options.function = 'myFunction';

        return pkg.hooks['package:function:package']()
        .then(() => {
          expect(packageFunctionStub.calledOnce).to.equal(true);
        });
      });

      it('should fail without function option', () => {
        pkg.options.function = false;

        return pkg.hooks['package:function:package']()
        .then(() => {
          expect(packageFunctionStub.called).to.equal(false);
        })
        .catch(err => {
          expect(err.message).to.equal('Function name must be set');
        });
      });
    });
  });
});
