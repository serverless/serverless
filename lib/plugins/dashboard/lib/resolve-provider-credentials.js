'use strict';

const { serviceSlug, instanceSlug } = require('./utils');
const { getPlatformClientWithAccessKey } = require('./client-utils');

module.exports = async ({ configuration: { org, app, service }, region, stage }) => {
  const sdk = await getPlatformClientWithAccessKey(org);

  let providerCredentials = {};
  try {
    const { orgUid } = await sdk.organizations.get({ orgName: org });
    providerCredentials = await sdk.getProvidersByOrgServiceInstance(
      orgUid,
      serviceSlug({ app, service }),
      instanceSlug({ app, service, stage, region })
    );
  } catch (err) {
    if (!err.statusCode === 404) {
      throw err;
    }
  }

  if (providerCredentials.result) {
    const awsCredentials = providerCredentials.result.find(
      (result) => result.providerName === 'aws'
    );
    if (awsCredentials) {
      return {
        accessKeyId: awsCredentials.providerDetails.accessKeyId,
        secretAccessKey: awsCredentials.providerDetails.secretAccessKey,
        sessionToken: awsCredentials.providerDetails.sessionToken,
      };
    }
  }

  return null;
};
