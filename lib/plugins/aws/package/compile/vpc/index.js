'use strict';

const BbPromise = require('bluebird');
const compileVpc = require('./lib/vpc');
const compileEip = require('./lib/eip');
const compileInternetGateway = require('./lib/internetGateway');
const compileVpcGatewayAttachment = require('./lib/vpcGatewayAttachment');
const compileRouteTable = require('./lib/routeTable');
const compileRoute = require('./lib/route');
const compileSubnets = require('./lib/subnets');
const compileSubnetRouteTableAssociation = require('./lib/subnetRouteTableAssociation');
const compileSecurityGroup = require('./lib/securityGroup');

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
      compileRouteTable,
      compileRoute,
      compileSubnets,
      compileSubnetRouteTableAssociation,
      compileSecurityGroup
    );

    this.hooks = {
      'package:compileVpc': () => {
        const { vpc } = this.serverless.service;

        if (
          (typeof vpc === 'boolean' && vpc) ||
          (typeof vpc === 'object' && Object.keys(vpc).length > 0)
        ) {
          return BbPromise.bind(this)
            .then(this.compileVpc)
            .then(this.compileEip)
            .then(this.compileInternetGateway)
            .then(this.compileVpcGatewayAttachment)
            .then(this.compileRouteTable)
            .then(this.compileRoute)
            .then(this.compileSubnets)
            .then(this.compileSubnetRouteTableAssociation)
            .then(this.compileSecurityGroup);
        }

        return BbPromise.resolve();
      },
    };
  }
}

module.exports = AwsCompileVpc;
