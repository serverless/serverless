'use strict';

const awsRequest = require('@serverless/test/aws-request');
const { expect } = require('chai');
const fixtures = require('../fixtures');
const { deployService, removeService } = require('../utils/integration');
const { resolveIotEndpoint } = require('../utils/iot');

describe('test/integration/iotFleetProvisioning.test.js', function() {
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
    const [
      {
        certificates: [{ certificateArn, certificateId }],
      },
      {
        policies: [{ policyName }],
      },
    ] = await Promise.all([
      awsRequest('Iot', 'listCertificates'),
      awsRequest('Iot', 'listPolicies'),
    ]);
    await Promise.all([
      awsRequest('Iot', 'detachThingPrincipal', {
        thingName: 'IotDevice',
        principal: certificateArn,
      }),
      awsRequest('Iot', 'detachPolicy', {
        policyName,
        target: certificateArn,
      }),
      awsRequest('Iot', 'updateCertificate', {
        certificateId,
        newStatus: 'INACTIVE',
      }),
    ]);
    await Promise.all([
      awsRequest('Iot', 'deleteThing', {
        thingName: 'IotDevice',
      }),
      awsRequest('Iot', 'deleteCertificate', {
        certificateId,
      }),
    ]);
    await removeService(servicePath);
  });

  it('setup a new IoT Thing with the provisioning template', async () => {
    const [{ certificatePem, keyPair }, iotEndpoint] = await Promise.all([
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
        certificatePem,
        privateKey: keyPair.PrivateKey,
      }),
    });

    const { things } = await awsRequest('Iot', 'listThings');
    expect(things[0].thingName).to.equal('IotDevice');
  });
});
