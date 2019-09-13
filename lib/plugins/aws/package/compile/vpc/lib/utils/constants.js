'use strict';

const INTERNET_CIDR = '0.0.0.0/0';

const SUBNET_CONFIG = {
  VPC_CIDR: '10.0.0.0/16',
  PUBLIC_CIDR: '10.0.0.0/24',
  PRIVATE_CIDR: '10.0.0.1/24',
};

const REGIONS = ['us-east-1', 'us-west-1', 'us-west-2'];

module.exports = {
  INTERNET_CIDR,
  SUBNET_CONFIG,
  REGIONS,
};
