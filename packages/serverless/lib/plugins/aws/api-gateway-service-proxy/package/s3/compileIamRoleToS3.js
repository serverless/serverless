import _ from 'lodash'

const SERVICE_NAME = 's3'

function convertToArn(bucket) {
  // bucket can be either a Ref, or a string (bucket name)
  if (bucket.Ref) {
    const logicalId = bucket.Ref
    return {
      'Fn::GetAtt': [logicalId, 'Arn'],
    }
  } else {
    return {
      'Fn::Sub': [
        'arn:${AWS::Partition}:s3:::${bucket}',
        {
          bucket,
        },
      ],
    }
  }
}

const exported = {
  compileIamRoleToS3() {
    if (!this.shouldCreateDefaultRole(SERVICE_NAME)) {
      return
    }

    const bucketActions = _.flatMap(
      this.getAllServiceProxies(),
      (serviceProxy) => {
        return _.flatMap(Object.keys(serviceProxy), (serviceName) => {
          if (serviceName !== SERVICE_NAME) {
            return []
          }

          return {
            bucket: serviceProxy.s3.bucket,
            action: serviceProxy.s3.action,
          }
        })
      },
    )

    const permissions = bucketActions.map(({ bucket, action }) => {
      return {
        Effect: 'Allow',
        Action: `s3:${action}*`, // e.g. PutObject*, GetObject*, DeleteObject*
        Resource: {
          'Fn::Join': ['', [convertToArn(bucket), '/*']],
        },
      }
    })

    const template = {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'apigateway.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            },
          ],
        },
        Policies: [
          {
            PolicyName: 'apigatewaytos3',
            PolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:PutLogEvents',
                  ],
                  Resource: '*',
                },
                ...permissions,
              ],
            },
          },
        ],
      },
    }

    _.merge(
      this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
      {
        ApigatewayToS3Role: template,
      },
    )
  },
}

export default exported
