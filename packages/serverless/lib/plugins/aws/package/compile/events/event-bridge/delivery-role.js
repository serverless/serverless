import _ from 'lodash'

// Same precedence as the execution role in merge-iam-templates.js.
const resolvePermissionsBoundary = (iamRole, rolePermissionsBoundary) =>
  iamRole.permissionsBoundary ||
  iamRole.permissionBoundary ||
  rolePermissionsBoundary

/**
 * Builds the one role EventBridge assumes to deliver events from Custom
 * Event Bus subscribers that set no `role`. It grants exactly the target
 * functions (and their aliases or versions) and the distinct dead-letter
 * queues of those subscribers.
 */
export const buildDeliveryRole = ({
  naming,
  functionLogicalIds,
  dlqArns,
  iamRole,
  rolePermissionsBoundary,
}) => {
  const invokeArns = _.uniq(functionLogicalIds).flatMap((logicalId) => {
    const functionArn = { 'Fn::GetAtt': [logicalId, 'Arn'] }
    return [functionArn, { 'Fn::Join': [':', [functionArn, '*']] }]
  })
  const queueArns = _.uniqWith(dlqArns, _.isEqual)

  const statements = [
    { Action: ['lambda:InvokeFunction'], Resource: invokeArns },
    { Action: ['sqs:SendMessage'], Resource: queueArns },
  ]
    .filter(({ Resource }) => Resource.length > 0)
    .map((statement) => ({ Effect: 'Allow', ...statement }))

  const properties = {
    AssumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: ['events.amazonaws.com'] },
          Action: ['sts:AssumeRole'],
          Condition: {
            StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } },
            ArnLike: {
              'aws:SourceArn': {
                'Fn::Sub':
                  'arn:${AWS::Partition}:events:${AWS::Region}:${AWS::AccountId}:subscriber/*',
              },
            },
          },
        },
      ],
    },
    Policies: [
      {
        PolicyName: naming.getEventBridgeDeliveryPolicyName(),
        PolicyDocument: { Version: '2012-10-17', Statement: statements },
      },
    ],
    Path: naming.getRolePath(),
    RoleName: naming.getEventBridgeDeliveryRoleName(),
  }

  const permissionsBoundary = resolvePermissionsBoundary(
    iamRole,
    rolePermissionsBoundary,
  )
  if (permissionsBoundary) properties.PermissionsBoundary = permissionsBoundary

  return { Type: 'AWS::IAM::Role', Properties: properties }
}
