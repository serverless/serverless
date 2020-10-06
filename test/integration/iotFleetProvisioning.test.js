'use strict';

const awsRequest = require('@serverless/test/aws-request');
const fixtures = require('../fixtures');
const { deployService, removeService } = require('../utils/integration');
const { resolveIotEndpoint } = require('../utils/iot');

describe('AWS - IoT Fleet Provisioning Integration Test', function() {
  this.timeout(1000 * 60 * 100); // Involves time-taking deploys
  let stackName;
  let servicePath;
  const stage = 'dev';

  const resolveTemplateName = async () => {
    const result = await awsRequest('CloudFormation', 'describeStacks', { StackName: stackName });
    return result.Stacks[0].Outputs.find(output => output.OutputKey === 'ProvisioningTemplateName')
      .OutputValue;
  };

  before(async () => {
    let serviceConfig;
    ({ serviceConfig, servicePath } = await fixtures.setup('iotFleetProvisioning'));
    const serviceName = serviceConfig.service;
    stackName = `${serviceName}-${stage}`;
    await deployService(servicePath);
  });

  after(async () => {
    await removeService(servicePath);
  });

  it('setup a new IoT Thing with the provisioning template', async () => {
    const [certificates, iotEndpoint] = await Promise.all([
      awsRequest('Iot', 'createProvisioningClaim', {
        templateName: await resolveTemplateName(),
      }),
      resolveIotEndpoint(),
    ]);
    await awsRequest('Lambda', 'invoke', {
      FunctionName: `${stackName}-registerDevice`,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        iotEndpoint,
        ...certificates,
      }),
    });
  });
});
