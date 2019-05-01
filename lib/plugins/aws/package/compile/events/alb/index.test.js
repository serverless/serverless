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
    let compileListenersStub;
    let compilePermissionsStub;

    beforeEach(() => {
      compileTargetGroupsStub = sinon
        .stub(awsCompileAlbEvents, 'compileTargetGroups').resolves();
      compileListenersStub = sinon
        .stub(awsCompileAlbEvents, 'compileListeners').resolves();
      compilePermissionsStub = sinon
        .stub(awsCompileAlbEvents, 'compilePermissions').resolves();
    });

    afterEach(() => {
      awsCompileAlbEvents.compileTargetGroups.restore();
      awsCompileAlbEvents.compileListeners.restore();
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
        const validateStub = sinon
          .stub(awsCompileAlbEvents, 'validate').returns({
            events: [
              {
                functionName: 'first',
                listener: 'HTTPS:443',
                loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456:loadbalancer/app/my-load-balancer/50dc6c495c0c9188', // eslint-disable-line
                certificateArn: 'arn:aws:iam::123456:server-certificate/ProdServerCert',
                name: 'some-alb-event-1',
              },
            ],
          });

        return awsCompileAlbEvents.hooks['package:compileEvents']().then(() => {
          expect(validateStub.calledOnce).to.be.equal(true);
          expect(compileTargetGroupsStub.calledAfter(validateStub)).to.be.equal(true);
          expect(compileListenersStub.calledAfter(compileTargetGroupsStub)).to.be.equal(true);
          expect(compilePermissionsStub.calledAfter(compileListenersStub)).to.be.equal(true);
        });
      });
    });

    it('should resolve if no functions are given', () => {
      awsCompileAlbEvents.serverless.service.functions = {};

      return awsCompileAlbEvents.hooks['package:compileEvents']();
    });
  });
});
