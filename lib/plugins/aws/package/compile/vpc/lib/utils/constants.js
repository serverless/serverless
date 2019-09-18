'use strict';

const INTERNET_CIDR = '0.0.0.0/0';

const SUBNET_CONFIG = {
  VPC_CIDR: '10.0.0.0/16',
  PUBLIC_CIDR: '10.0.0.0/24',
  PRIVATE_CIDR: '10.0.0.1/24',
};

const SUBNET_TYPES = {
  PRIVATE: 'Private',
  PUBLIC: 'Public',
};

module.exports = {
  INTERNET_CIDR,
  SUBNET_CONFIG,
  SUBNET_TYPES,
};
