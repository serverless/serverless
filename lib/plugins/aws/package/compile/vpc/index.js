'use strict';

const compileVpc = require('./lib/vpc');
const compileEip = require('./lib/eip');
const compileInternetGateway = require('./lib/internetGateway');
const compileVpcGatewayAttachment = require('./lib/vpcGatewayAttachment');
const compileRouteTables = require('./lib/routeTables');
const compileSubnets = require('./lib/subnets');
const compileNatGateways = require('./lib/natGateways');
const compileRoutes = require('./lib/routes');
const compileSubnetRouteTableAssociations = require('./lib/subnetRouteTableAssociations');
const compileLambdaSecurityGroup = require('./lib/lambdaSecurityGroup');
const updateFunctionConfigs = require('./lib/updateFunctionConfigs');
const compileCloudFormationOutputs = require('./lib/cloudFormationOutputs');
const compileSfeOutputs = require('./lib/sfeOutputs');

class AwsCompileVpc {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    Object.assign(
      this,
      compileVpc,
      compileEip,
      compileInternetGateway,
      compileVpcGatewayAttachment,
      compileRouteTables,
      compileSubnets,
      compileNatGateways,
      compileRoutes,
      compileSubnetRouteTableAssociations,
      compileLambdaSecurityGroup,
      updateFunctionConfigs,
      compileCloudFormationOutputs,
      compileSfeOutputs
    );

    this.hooks = {
      'package:compileVpc': () => {
        const { vpc } = this.serverless.service;

        if (
          (typeof vpc === 'boolean' && vpc) ||
          (typeof vpc === 'object' && Object.keys(vpc).length > 0)
        ) {
          this.compileVpc.call(this);
          this.compileEip.call(this);
          this.compileInternetGateway.call(this);
          this.compileVpcGatewayAttachment.call(this);
          this.compileRouteTables.call(this);
          this.compileSubnets.call(this);
          this.compileNatGateways.call(this);
          this.compileRoutes.call(this);
          this.compileSubnetRouteTableAssociations.call(this);
          this.compileLambdaSecurityGroup.call(this);
          this.updateFunctionConfigs.call(this);
          this.compileCloudFormationOutputs.call(this);
          this.compileSfeOutputs.call(this);
        }
      },
    };
  }
}

module.exports = AwsCompileVpc;
