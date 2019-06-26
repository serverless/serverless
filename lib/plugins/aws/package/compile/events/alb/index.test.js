'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileAlbEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileAlbEvents', () => {
  let awsCompileAlbEvents;

  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileAlbEvents = new AwsCompileAlbEvents(serverless, options);
  });

  describe('#constructor()', () => {
    let compileTargetGroupsStub;
    let compileListenerRulesStub;
    let compilePermissionsStub;

    beforeEach(() => {
      compileTargetGroupsStub = sinon.stub(awsCompileAlbEvents, 'compileTargetGroups').resolves();
      compileListenerRulesStub = sinon.stub(awsCompileAlbEvents, 'compileListenerRules').resolves();
      compilePermissionsStub = sinon.stub(awsCompileAlbEvents, 'compilePermissions').resolves();
    });

    afterEach(() => {
      awsCompileAlbEvents.compileTargetGroups.restore();
      awsCompileAlbEvents.compileListenerRules.restore();
      awsCompileAlbEvents.compilePermissions.restore();
    });

    it('should have hooks', () => expect(awsCompileAlbEvents.hooks).to.be.not.empty);

    it('should set the provider variable to be an instanceof AwsProvider', () =>
      expect(awsCompileAlbEvents.provider).to.be.instanceof(AwsProvider));

    describe('"package:compileEvents" promise chain', () => {
      afterEach(() => {
        awsCompileAlbEvents.validate.restore();
      });

      it('should run the promise chain in order', () => {
        const validateStub = sinon.stub(awsCompileAlbEvents, 'validate').returns({
          events: [
            {
              functionName: 'first',
              listenerArn:
                'arn:aws:elasticloadbalancing:' +
                'us-east-1:123456789012:listener/app/my-load-balancer/' +
                '50dc6c495c0c9188/f2f7dc8efc522ab2',
              priority: 1,
              conditions: {
                host: 'example.com',
                path: '/hello',
              },
            },
          ],
        });

        return awsCompileAlbEvents.hooks['package:compileEvents']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);
          expect(compileTargetGroupsStub.calledAfter(validateStub)).to.be.equal(true);
          expect(compileListenerRulesStub.calledAfter(compileTargetGroupsStub)).to.be.equal(true);
          expect(compilePermissionsStub.calledAfter(compileListenerRulesStub)).to.be.equal(true);
        });
      });
    });

    it('should resolve if no functions are given', () => {
      awsCompileAlbEvents.serverless.service.functions = {};

      return awsCompileAlbEvents.hooks['package:compileEvents']();
    });
  });
});
