'use strict';

const REGIONS = ['us-east-1', 'us-west-1', 'us-west-2'];

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

const SECURITY_GROUP = {
  DEFAULT_INGRESS: [
    {
      IpProtocol: -1,
      CidrIp: '0.0.0.0/0',
    },
  ],
  DEFAULT_EGRESS: [
    {
      IpProtocol: -1,
      CidrIp: '0.0.0.0/0',
    },
  ],
};

module.exports = {
  REGIONS,
  INTERNET_CIDR,
  SUBNET_CONFIG,
  SUBNET_TYPES,
  SECURITY_GROUP,
};
