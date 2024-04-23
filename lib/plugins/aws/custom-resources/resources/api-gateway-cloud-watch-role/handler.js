'use strict';

const { awsRequest, wait } = require('../utils');
const { getEnvironment, handlerWrapper } = require('../utils');
const {
  APIGatewayClient,
  GetAccountCommand,
  UpdateAccountCommand,
} = require('@aws-sdk/client-api-gateway');
const {
  IAMClient,
  ListAttachedRolePoliciesCommand,
  CreateRoleCommand,
  AttachRolePolicyCommand,
} = require('@aws-sdk/client-iam');

async function handler(event, context) {
  if (event.RequestType === 'Create') {
    return create(event, context);
  } else if (event.RequestType === 'Update') {
    return update(event, context);
  } else if (event.RequestType === 'Delete') {
    return remove(event, context);
  }
  throw new Error(`Unhandled RequestType ${event.RequestType}`);
}

async function create(event, context) {
  const { RoleArn } = event.ResourceProperties;
  const { Partition: partition, AccountId: accountId, Region: region } = getEnvironment(context);

  const apiGatewayClient = new APIGatewayClient({ region });
  const assignedRoleArn = (await awsRequest(() => apiGatewayClient.send(new GetAccountCommand())))
    .cloudwatchRoleArn;

  let roleArn = `arn:${partition}:iam::${accountId}:role/serverlessApiGatewayCloudWatchRole`;
  if (RoleArn) {
    // if there's a roleArn in the Resource Properties, just re-use it here
    roleArn = RoleArn;
  } else {
    // Create an own API Gateway role if the roleArn was not set via Resource Properties
    const apiGatewayPushToCloudWatchLogsPolicyArn = `arn:${partition}:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs`;

    const roleName = roleArn.slice(roleArn.lastIndexOf('/') + 1);

    const iamClient = new IAMClient({ region });
    const attachedPolicies = await (async () => {
      try {
        return (
          await awsRequest(() =>
            iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }))
          )
        ).AttachedPolicies;
      } catch (error) {
        if (error.code === 'NoSuchEntity') {
          // Role doesn't exist yet, create;
          const createRoleCommand = new CreateRoleCommand({
            AssumeRolePolicyDocument: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: ['apigateway.amazonaws.com'],
                  },
                  Action: ['sts:AssumeRole'],
                },
              ],
            }),
            Path: '/',
            RoleName: roleName,
          });
          await awsRequest(() => iamClient.send(createRoleCommand));
          return [];
        }
        throw error;
      }
    })();

    if (
      !attachedPolicies.some(
        (policy) => policy.PolicyArn === apiGatewayPushToCloudWatchLogsPolicyArn
      )
    ) {
      const attachRoleCommand = new AttachRolePolicyCommand({
        PolicyArn: apiGatewayPushToCloudWatchLogsPolicyArn,
        RoleName: roleName,
      });
      await awsRequest(() => iamClient.send(attachRoleCommand));
    }
  }

  // there's nothing to do if the role is the same
  if (roleArn === assignedRoleArn) return null;

  const updateAccount = async (counter = 1) => {
    try {
      const command = new UpdateAccountCommand({
        patchOperations: [
          {
            op: 'replace',
            path: '/cloudwatchRoleArn',
            value: roleArn,
          },
        ],
      });

      await awsRequest(() => apiGatewayClient.send(command));
    } catch (error) {
      if (counter < 10) {
        // Observed fails with errors marked as non-retryable. Still they're outcome of
        // temporary state where just created AWS role is not being ready for use (yet)
        await wait(10000);
        return updateAccount(++counter);
      }
      throw error;
    }
    return null;
  };

  return updateAccount();
}

function update() {
  // No actions
}

function remove() {
  // No actions
}

module.exports = {
  handler: handlerWrapper(handler, 'CustomResourceApiGatewayAccountCloudWatchRole'),
};
