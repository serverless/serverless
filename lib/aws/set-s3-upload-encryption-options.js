'use strict';

module.exports = (putParams, deploymentBucketOptions) => {
  const encryptionFields = [
    ['serverSideEncryption', 'ServerSideEncryption'],
    ['sseCustomerAlgorithim', 'SSECustomerAlgorithm'],
    ['sseCustomerKey', 'SSECustomerKey'],
    ['sseCustomerKeyMD5', 'SSECustomerKeyMD5'],
    ['sseKMSKeyId', 'SSEKMSKeyId'],
  ];

  const params = putParams;

  encryptionFields.forEach((element) => {
    if (deploymentBucketOptions[element[0]]) {
      params[element[1]] = deploymentBucketOptions[element[0]];
    }
  });

  return params;
};
