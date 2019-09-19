'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const AwsProvider = require('../../../provider/awsProvider');
const AwsCompileVpc = require('./index');
const Serverless = require('../../../../../Serverless');

describe('AwsCompileVpc', () => {
  let awsCompileVpc;

  beforeEach(() => {
    const serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileVpc = new AwsCompileVpc(serverless, options);
    awsCompileVpc.serverless.service.vpc = true;
  });

  describe('#constructor()', () => {
    let compileVpcStub;
    let compileEipStub;
    let compileInternetGatewayStub;
    let compileVpcGatewayAttachmentStub;
    let compileRouteTablesStub;
    let compileSubnetsStub;
    let compileNatGatewaysStub;
    let compileRoutesStub;
    let compileSubnetRouteTableAssociationsStub;
    let compileLambdaSecurityGroupStub;
    let updateFunctionConfigsStub;
    let compileCloudFormationOutputsStub;
    let compileSfeOutputsStub;

    beforeEach(() => {
      compileVpcStub = sinon.stub(awsCompileVpc, 'compileVpc').resolves();
      compileEipStub = sinon.stub(awsCompileVpc, 'compileEip').resolves();
      compileInternetGatewayStub = sinon.stub(awsCompileVpc, 'compileInternetGateway').resolves();
      compileVpcGatewayAttachmentStub = sinon
        .stub(awsCompileVpc, 'compileVpcGatewayAttachment')
        .resolves();
      compileRouteTablesStub = sinon.stub(awsCompileVpc, 'compileRouteTables').resolves();
      compileSubnetsStub = sinon.stub(awsCompileVpc, 'compileSubnets').resolves();
      compileNatGatewaysStub = sinon.stub(awsCompileVpc, 'compileNatGateways').resolves();
      compileRoutesStub = sinon.stub(awsCompileVpc, 'compileRoutes').resolves();
      compileSubnetRouteTableAssociationsStub = sinon
        .stub(awsCompileVpc, 'compileSubnetRouteTableAssociations')
        .resolves();
      compileLambdaSecurityGroupStub = sinon
        .stub(awsCompileVpc, 'compileLambdaSecurityGroup')
        .resolves();
      updateFunctionConfigsStub = sinon.stub(awsCompileVpc, 'updateFunctionConfigs').resolves();
      compileCloudFormationOutputsStub = sinon
        .stub(awsCompileVpc, 'compileCloudFormationOutputs')
        .resolves();
      compileSfeOutputsStub = sinon.stub(awsCompileVpc, 'compileSfeOutputs').resolves();
    });

    afterEach(() => {
      awsCompileVpc.compileVpc.restore();
      awsCompileVpc.compileEip.restore();
      awsCompileVpc.compileInternetGateway.restore();
      awsCompileVpc.compileVpcGatewayAttachment.restore();
      awsCompileVpc.compileRouteTables.restore();
      awsCompileVpc.compileSubnets.restore();
      awsCompileVpc.compileNatGateways.restore();
      awsCompileVpc.compileRoutes.restore();
      awsCompileVpc.compileSubnetRouteTableAssociations.restore();
      awsCompileVpc.compileLambdaSecurityGroup.restore();
      awsCompileVpc.updateFunctionConfigs.restore();
      awsCompileVpc.compileCloudFormationOutputs.restore();
      awsCompileVpc.compileSfeOutputs.restore();
    });

    it('should have hooks', () => expect(awsCompileVpc.hooks).to.be.not.empty);

    it('should set the provider variable to be an instanceof AwsProvider', () =>
      expect(awsCompileVpc.provider).to.be.instanceof(AwsProvider));

    describe('"package:compileVpc" promise chain', () => {
      it('should run the promise chain in order', () => {
        return awsCompileVpc.hooks['package:compileVpc']().then(() => {
          expect(compileVpcStub.calledOnce).to.be.equal(true);
          expect(compileEipStub.calledAfter(compileVpcStub)).to.be.equal(true);
          expect(compileInternetGatewayStub.calledAfter(compileEipStub)).to.be.equal(true);
          expect(
            compileVpcGatewayAttachmentStub.calledAfter(compileInternetGatewayStub)
          ).to.be.equal(true);
          expect(compileRouteTablesStub.calledAfter(compileVpcGatewayAttachmentStub)).to.be.equal(
            true
          );
          expect(compileSubnetsStub.calledAfter(compileRouteTablesStub)).to.be.equal(true);
          expect(compileNatGatewaysStub.calledAfter(compileSubnetsStub)).to.be.equal(true);
          expect(compileRoutesStub.calledAfter(compileNatGatewaysStub)).to.be.equal(true);

          expect(
            compileSubnetRouteTableAssociationsStub.calledAfter(compileRoutesStub)
          ).to.be.equal(true);
          expect(
            compileLambdaSecurityGroupStub.calledAfter(compileSubnetRouteTableAssociationsStub)
          ).to.be.equal(true);
          expect(updateFunctionConfigsStub.calledAfter(compileLambdaSecurityGroupStub)).to.be.equal(
            true
          );
          expect(
            compileCloudFormationOutputsStub.calledAfter(updateFunctionConfigsStub)
          ).to.be.equal(true);
          expect(compileSfeOutputsStub.calledAfter(compileCloudFormationOutputsStub)).to.be.equal(
            true
          );
        });
      });
    });

    it('should resolve if vpc config is not explicitly set', () => {
      return awsCompileVpc.hooks['package:compileVpc']();
    });
  });
});
