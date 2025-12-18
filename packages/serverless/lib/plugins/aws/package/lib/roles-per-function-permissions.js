import _ from 'lodash'

function applyLogPermissions({
  functionObject,
  policyStatements,
  serverless,
  provider,
}) {
  const awsProvider = provider || serverless.getProvider('aws')
  const configProvider = serverless.service.provider || {}

  const resolvedLogGroupName =
    functionObject?.logs?.logGroup ||
    configProvider.logs?.lambda?.logGroup ||
    awsProvider.naming.getLogGroupName(functionObject.name)

  policyStatements[0] = {
    Effect: 'Allow',
    Action: [
      'logs:CreateLogStream',
      'logs:CreateLogGroup',
      'logs:PutLogEvents',
    ],
    Resource: [
      {
        'Fn::Sub':
          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
          `:log-group:${resolvedLogGroupName}:*:*`,
      },
    ],
  }

  if (functionObject && functionObject.disableLogs) {
    policyStatements.push({
      Effect: 'Deny',
      Action: ['logs:PutLogEvents'],
      Resource: [
        {
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
            `:log-group:${resolvedLogGroupName}:*:*`,
        },
      ],
    })
  }
}

function applyVpcPermissions({
  functionObject,
  functionIamRole,
  configProvider,
}) {
  if (!_.isEmpty(functionObject.vpc) || !_.isEmpty(configProvider.vpc)) {
    functionIamRole.Properties.ManagedPolicyArns.push({
      'Fn::Join': [
        '',
        [
          'arn:',
          { Ref: 'AWS::Partition' },
          ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
        ],
      ],
    })
  }
}

function applyDurablePermissions({ functionObject, functionIamRole }) {
  if (!functionObject.durableConfig) return

  functionIamRole.Properties.ManagedPolicyArns.push({
    'Fn::Join': [
      '',
      [
        'arn:',
        { Ref: 'AWS::Partition' },
        ':iam::aws:policy/service-role/AWSLambdaBasicDurableExecutionRolePolicy',
      ],
    ],
  })
}

function applyStreamPermissions({
  functionObject,
  policyStatements,
  throwError,
}) {
  const res = []
  if (!Array.isArray(functionObject.events) || !functionObject.events.length)
    return
  const dynamodbStreamStatement = {
    Effect: 'Allow',
    Action: [
      'dynamodb:GetRecords',
      'dynamodb:GetShardIterator',
      'dynamodb:DescribeStream',
      'dynamodb:ListStreams',
    ],
    Resource: [],
  }
  const kinesisStreamStatement = {
    Effect: 'Allow',
    Action: [
      'kinesis:GetRecords',
      'kinesis:GetShardIterator',
      'kinesis:DescribeStream',
      'kinesis:ListStreams',
    ],
    Resource: [],
  }
  for (const event of functionObject.events) {
    if (event.stream) {
      const streamArn = event.stream.arn || event.stream
      const streamType = event.stream.type || String(streamArn).split(':')[2]
      switch (streamType) {
        case 'dynamodb':
          dynamodbStreamStatement.Resource.push(streamArn)
          break
        case 'kinesis':
          kinesisStreamStatement.Resource.push(streamArn)
          break
        default:
          if (typeof throwError === 'function') {
            throwError(
              `Unsupported stream type: ${streamType} for function: `,
              functionObject,
            )
          }
      }
    }
  }
  if (dynamodbStreamStatement.Resource.length) {
    policyStatements.push(dynamodbStreamStatement)
  }
  if (kinesisStreamStatement.Resource.length) {
    policyStatements.push(kinesisStreamStatement)
  }
}

function applySqsPermissions({ functionObject, policyStatements }) {
  const sqsStatement = {
    Effect: 'Allow',
    Action: [
      'sqs:ReceiveMessage',
      'sqs:DeleteMessage',
      'sqs:GetQueueAttributes',
    ],
    Resource: [],
  }
  if (!Array.isArray(functionObject.events)) return
  for (const event of functionObject.events) {
    if (event.sqs) {
      const sqsArn = event.sqs.arn || event.sqs
      sqsStatement.Resource.push(sqsArn)
    }
  }
  if (sqsStatement.Resource.length) {
    policyStatements.push(sqsStatement)
  }
}

function applyOnErrorPermissions({ functionObject, policyStatements }) {
  if (!_.isEmpty(functionObject.onError)) {
    policyStatements.push({
      Effect: 'Allow',
      Action: ['sns:Publish'],
      Resource: functionObject.onError,
    })
  }
}

function applyWebsocketsPermissions({ functionObject, policyStatements }) {
  if (!Array.isArray(functionObject.events)) return
  const hasWebsocketEvent = functionObject.events.some(
    (event) => event.websocket,
  )
  if (!hasWebsocketEvent) return

  policyStatements.push({
    Effect: 'Allow',
    Action: ['execute-api:ManageConnections'],
    Resource: [
      {
        'Fn::Sub': 'arn:${AWS::Partition}:execute-api:*:*:*/@connections/*',
      },
    ],
  })
}

function applyMqPermissions({ functionObject, policyStatements }) {
  if (!Array.isArray(functionObject.events)) return

  const secretsResources = []
  const brokerResources = []
  let needsEc2Permissions = false

  for (const event of functionObject.events) {
    if (event.rabbitmq) {
      const { basicAuthArn, arn } = event.rabbitmq
      if (basicAuthArn) secretsResources.push(basicAuthArn)
      if (arn) brokerResources.push(arn)
      needsEc2Permissions = true
    }
    if (event.activemq) {
      const { basicAuthArn, arn } = event.activemq
      if (basicAuthArn) secretsResources.push(basicAuthArn)
      if (arn) brokerResources.push(arn)
      needsEc2Permissions = true
    }
  }

  if (secretsResources.length) {
    policyStatements.push({
      Effect: 'Allow',
      Action: ['secretsmanager:GetSecretValue'],
      Resource: secretsResources,
    })
  }

  if (brokerResources.length) {
    policyStatements.push({
      Effect: 'Allow',
      Action: ['mq:DescribeBroker'],
      Resource: brokerResources,
    })
  }

  if (needsEc2Permissions) {
    policyStatements.push({
      Effect: 'Allow',
      Action: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DescribeVpcs',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
      ],
      Resource: '*',
    })
  }
}

function applyKafkaPermissions({ functionObject, policyStatements }) {
  if (!Array.isArray(functionObject.events)) return

  const secretsResources = []
  let needsEc2Permissions = false

  for (const event of functionObject.events) {
    if (!event.kafka || !event.kafka.accessConfigurations) continue
    const { accessConfigurations } = event.kafka
    for (const [type, values] of Object.entries(accessConfigurations)) {
      if (!Array.isArray(values) || !values.length) continue
      switch (type) {
        case 'vpcSubnet':
        case 'vpcSecurityGroup':
          needsEc2Permissions = true
          break
        case 'saslPlainAuth':
        case 'saslScram256Auth':
        case 'saslScram512Auth':
        case 'clientCertificateTlsAuth':
        case 'serverRootCaCertificate':
          for (const value of values) {
            secretsResources.push(value)
          }
          break
        default:
          break
      }
    }
  }

  if (secretsResources.length) {
    policyStatements.push({
      Effect: 'Allow',
      Action: ['secretsmanager:GetSecretValue'],
      Resource: secretsResources,
    })
  }

  if (needsEc2Permissions) {
    policyStatements.push({
      Effect: 'Allow',
      Action: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DescribeVpcs',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
      ],
      Resource: '*',
    })
  }
}

function applyMskPermissions({ functionObject, policyStatements }) {
  if (!Array.isArray(functionObject.events)) return

  const mskResources = []
  let needsEc2Permissions = false

  for (const event of functionObject.events) {
    if (!event.msk) continue
    const { arn } = event.msk
    if (arn) mskResources.push(arn)
    // MSK always needs EC2 networking permissions when used
    needsEc2Permissions = true
  }

  if (mskResources.length) {
    policyStatements.push({
      Effect: 'Allow',
      Action: ['kafka:DescribeCluster', 'kafka:GetBootstrapBrokers'],
      Resource: mskResources,
    })
  }

  if (needsEc2Permissions) {
    policyStatements.push({
      Effect: 'Allow',
      Action: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DescribeVpcs',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
      ],
      Resource: '*',
    })
  }
}

function applyCloudFrontPermissionsAndTrust({
  functionObject,
  functionIamRole,
  policyStatements,
}) {
  if (!Array.isArray(functionObject.events)) return
  const hasCloudFrontEvent = functionObject.events.some(
    (event) => event.cloudFront,
  )
  if (!hasCloudFrontEvent) return

  const assumeRole = functionIamRole.Properties.AssumeRolePolicyDocument
  if (assumeRole && Array.isArray(assumeRole.Statement)) {
    const lambdaAssumeStatement = assumeRole.Statement.find((statement) => {
      const principal = statement.Principal || {}
      const services = principal.Service
      if (Array.isArray(services)) {
        return services.includes('lambda.amazonaws.com')
      }
      return services === 'lambda.amazonaws.com'
    })
    if (lambdaAssumeStatement) {
      let services = lambdaAssumeStatement.Principal.Service
      if (!Array.isArray(services)) services = [services]
      if (!services.includes('edgelambda.amazonaws.com')) {
        services.push('edgelambda.amazonaws.com')
      }
      lambdaAssumeStatement.Principal.Service = services
    }
  }

  policyStatements.push({
    Effect: 'Allow',
    Action: [
      'logs:CreateLogGroup',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
      'logs:TagResource',
    ],
    Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:logs:*:*:*' }],
  })
}

function applySchedulerPermissionsAndTrust({
  functionName,
  functionObject,
  functionIamRole,
  policyStatements,
}) {
  if (!Array.isArray(functionObject.events)) return

  const schedulerResources = []

  for (const event of functionObject.events) {
    if (!event.schedule || !event.schedule.method) continue
    if (event.schedule.method !== 'scheduler') continue

    const functionArnBase =
      'arn:${AWS::Partition}:lambda:${AWS::Region}:${AWS::AccountId}' +
      `:function:${functionObject.name || functionName}`

    schedulerResources.push(
      { 'Fn::Sub': functionArnBase },
      { 'Fn::Sub': `${functionArnBase}:*` },
    )
  }

  if (!schedulerResources.length) return

  const assumeRole = functionIamRole.Properties.AssumeRolePolicyDocument
  if (assumeRole && Array.isArray(assumeRole.Statement)) {
    const lambdaAssumeStatement = assumeRole.Statement.find((statement) => {
      const principal = statement.Principal || {}
      const services = principal.Service
      if (Array.isArray(services)) {
        return services.includes('lambda.amazonaws.com')
      }
      return services === 'lambda.amazonaws.com'
    })
    if (lambdaAssumeStatement) {
      let services = lambdaAssumeStatement.Principal.Service
      if (!Array.isArray(services)) services = [services]
      if (!services.includes('scheduler.amazonaws.com')) {
        services.push('scheduler.amazonaws.com')
      }
      lambdaAssumeStatement.Principal.Service = services
    }
  }

  policyStatements.push({
    Effect: 'Allow',
    Action: ['lambda:InvokeFunction'],
    Resource: schedulerResources,
  })
}

function applyXrayPermissions({
  functionName,
  functionObject,
  policyStatements,
  serverless,
}) {
  const provider = serverless.service.provider || {}
  const providerTracing = provider.tracing && provider.tracing.lambda
  const tracing = functionObject.tracing || providerTracing
  if (!tracing) return

  const stmt = {
    Effect: 'Allow',
    Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
    Resource: ['*'],
  }

  const hasExisting = policyStatements.some((s) => _.isEqual(s, stmt))
  if (!hasExisting) {
    policyStatements.push(stmt)
  }
}

function applyEfsPermissions({ functionObject, policyStatements }) {
  const fileSystemConfig = functionObject.fileSystemConfig
  if (!fileSystemConfig || !fileSystemConfig.arn) return

  const stmt = {
    Effect: 'Allow',
    Action: ['elasticfilesystem:ClientMount', 'elasticfilesystem:ClientWrite'],
    Resource: [fileSystemConfig.arn],
  }

  policyStatements.push(stmt)
}

export default function applyPerFunctionPermissions({
  functionName,
  functionObject,
  functionIamRole,
  policyStatements,
  serverless,
  provider,
  throwError,
}) {
  if (!functionObject || !functionIamRole) return

  applyLogPermissions({
    functionObject,
    policyStatements,
    serverless,
    provider,
  })
  applyVpcPermissions({
    functionObject,
    functionIamRole,
    configProvider: serverless.service.provider || {},
  })
  applyDurablePermissions({ functionObject, functionIamRole })
  applyStreamPermissions({ functionObject, policyStatements, throwError })
  applySqsPermissions({ functionObject, policyStatements })
  applyOnErrorPermissions({ functionObject, policyStatements })

  applyWebsocketsPermissions({ functionObject, policyStatements })
  applyMqPermissions({ functionObject, policyStatements })
  applyKafkaPermissions({ functionObject, policyStatements })
  applyMskPermissions({ functionObject, policyStatements })
  applyCloudFrontPermissionsAndTrust({
    functionObject,
    functionIamRole,
    policyStatements,
  })
  applySchedulerPermissionsAndTrust({
    functionName,
    functionObject,
    functionIamRole,
    policyStatements,
  })
  applyXrayPermissions({
    functionName,
    functionObject,
    policyStatements,
    serverless,
  })
  applyEfsPermissions({ functionObject, policyStatements })
}
