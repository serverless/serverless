'use strict';

const { isBoolean, isObject, isEmpty } = require('lodash');
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
      { compileVpc },
      { compileEip },
      { compileInternetGateway },
      { compileVpcGatewayAttachment },
      { compileRouteTables },
      { compileSubnets },
      { compileNatGateways },
      { compileRoutes },
      { compileSubnetRouteTableAssociations },
      { compileLambdaSecurityGroup },
      { updateFunctionConfigs },
      { compileCloudFormationOutputs },
      { compileSfeOutputs }
    );

    this.hooks = {
      'package:compileVpc': () => {
        const { vpc } = this.serverless.service;

        if (isBoolean(vpc) || (isObject(vpc) && !isEmpty(vpc))) {
          const vpcConfig = {};
          const subnetConfigs = {};

          if (isObject(vpc)) {
            if (vpc.cidrBlock) {
              vpcConfig.cidrBlock = vpc.cidrBlock;
            }

            if (vpc.subnets && vpc.subnets.private) {
              const { cidrBlock } = vpc.subnets.private;
              subnetConfigs.private = {
                cidrBlock,
              };
            }
            if (vpc.subnets && vpc.subnets.public) {
              const { cidrBlock } = vpc.subnets.public;
              subnetConfigs.public = {
                cidrBlock,
              };
            }
          }

          this.compileVpc(vpcConfig);
          this.compileEip();
          this.compileInternetGateway();
          this.compileVpcGatewayAttachment();
          this.compileRouteTables();
          this.compileSubnets(subnetConfigs);
          this.compileNatGateways();
          this.compileRoutes();
          this.compileSubnetRouteTableAssociations();
          this.compileLambdaSecurityGroup();
          this.updateFunctionConfigs();
          this.compileCloudFormationOutputs();
          this.compileSfeOutputs();
        }
      },
    };
  }
}

module.exports = AwsCompileVpc;
