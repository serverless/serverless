'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileApigEvents = require('./index');
const Serverless = require('../../../../../../Serverless');
const validate = require('../../../../lib/validate');
const disassociateUsagePlan = require('./lib/disassociateUsagePlan');

describe('AwsCompileApigEvents', () => {
  let awsCompileApigEvents;

  beforeEach(() => {
    const serverless = new Serverless();
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
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileApigEvents = new AwsCompileApigEvents(serverless, options);
  });

  describe('#constructor()', () => {
    let compileRestApiStub;
    let compileResourcesStub;
    let compileMethodsStub;
    let compileDeploymentStub;
    let compileUsagePlanStub;
    let compilePermissionsStub;
    let disassociateUsagePlanStub;

    beforeEach(() => {
      compileRestApiStub = sinon
        .stub(awsCompileApigEvents, 'compileRestApi').resolves();
      compileResourcesStub = sinon
        .stub(awsCompileApigEvents, 'compileResources').resolves();
      compileMethodsStub = sinon
        .stub(awsCompileApigEvents, 'compileMethods').resolves();
      compileDeploymentStub = sinon
        .stub(awsCompileApigEvents, 'compileDeployment').resolves();
      compileUsagePlanStub = sinon
        .stub(awsCompileApigEvents, 'compileUsagePlan').resolves();
      compilePermissionsStub = sinon
        .stub(awsCompileApigEvents, 'compilePermissions').resolves();
      disassociateUsagePlanStub = sinon
        .stub(disassociateUsagePlan, 'disassociateUsagePlan').resolves();
    });

    afterEach(() => {
      awsCompileApigEvents.compileRestApi.restore();
      awsCompileApigEvents.compileResources.restore();
      awsCompileApigEvents.compileMethods.restore();
      awsCompileApigEvents.compileDeployment.restore();
      awsCompileApigEvents.compileUsagePlan.restore();
      awsCompileApigEvents.compilePermissions.restore();
      disassociateUsagePlan.disassociateUsagePlan.restore();
    });

    it('should have hooks', () => expect(awsCompileApigEvents.hooks).to.be.not.empty);

    it('should set the provider variable to be an instanceof AwsProvider', () =>
      expect(awsCompileApigEvents.provider).to.be.instanceof(AwsProvider));

    it('should run "package:compileEvents" promise chain in order', () => {
      const validateStub = sinon
        .stub(awsCompileApigEvents, 'validate').returns({
          events: [
            {
              functionName: 'first',
              http: {
                path: 'users',
                method: 'POST',
              },
            },
          ],
        });

      return awsCompileApigEvents.hooks['package:compileEvents']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(compileRestApiStub.calledAfter(validateStub)).to.be.equal(true);
        expect(compileResourcesStub.calledAfter(compileRestApiStub)).to.be.equal(true);
        expect(compileMethodsStub.calledAfter(compileResourcesStub)).to.be.equal(true);
        expect(compileDeploymentStub.calledAfter(compileMethodsStub)).to.be.equal(true);
        expect(compileUsagePlanStub.calledAfter(compileDeploymentStub)).to.be.equal(true);
        expect(compilePermissionsStub.calledAfter(compileUsagePlanStub)).to.be.equal(true);

        awsCompileApigEvents.validate.restore();
      });
    });

    it('should run "before:remove:remove" promise chain in order', () => {
      const validateStub = sinon.stub(validate, 'validate').returns();

      return awsCompileApigEvents.hooks['before:remove:remove']().then(() => {
        expect(validateStub.calledOnce).to.equal(true);
        expect(disassociateUsagePlanStub.calledAfter(validateStub)).to.equal(true);

        validate.validate.restore();
      });
    });

    it('should resolve if no functions are given', () => {
      awsCompileApigEvents.serverless.service.functions = {};

      return awsCompileApigEvents.hooks['package:compileEvents']();
    });
  });
});
