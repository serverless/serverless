<!--
title: IAM Permissions for Functions
description: 'Grant AWS Lambda functions IAM permissions in serverless.yml: the default execution role, per-function roles, custom roles and the deployment role.'
short_title: IAM Permissions
keywords:
  [
    'Serverless Framework',
    'AWS IAM',
    'Lambda execution role',
    'per-function IAM roles',
    'iam.role.statements',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/iam)

<!-- DOCS-SITE-LINK:END -->

# IAM Permissions for Functions

Every AWS Lambda function runs with an IAM execution role that decides which AWS resources its code can use. By default, the Serverless Framework creates one execution role for the service, shares it between the functions, and adds the permissions their configuration needs. This page shows how to add your own permissions to that role, give functions roles of their own, use roles you manage yourself, and set the role CloudFormation deploys with.

To let every function read and write one DynamoDB table, add a statement to the default role:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - dynamodb:GetItem
            - dynamodb:PutItem
          Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Users

functions:
  hello:
    handler: handler.hello
```

## The `provider.iam` settings

All IAM settings of the service live under `provider.iam`:

```yaml
provider:
  name: aws
  iam:
    role:
      mode: shared # or perFunction; default shared
      name: my-service-${sls:stage}-lambda # default <service>-<stage>-<region>-lambdaRole
      path: /my-team/ # default /
      statements:
        - Effect: Allow
          Action: s3:GetObject
          Resource: arn:aws:s3:::my-bucket/*
      managedPolicies:
        - arn:aws:iam::123456789012:policy/my-managed-policy
      permissionsBoundary: arn:aws:iam::123456789012:policy/my-boundary
      tags:
        team: payments
    deploymentRole: arn:aws:iam::123456789012:role/cfn-deployment-role
```

| Key                                     | Type             | Description                                                                                                            |
| --------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `provider.iam.role`                     | object or string | The default execution role's settings, or an existing role to use instead (see [Custom IAM roles](#custom-iam-roles)). |
| `provider.iam.role.mode`                | string           | `shared` (default) or `perFunction` (see [Per-function IAM roles](#per-function-iam-roles)).                           |
| `provider.iam.role.name`                | string           | Role name, 1 to 64 characters of `A-Za-z0-9_+=,.@-`. Put a slash-separated prefix in `path`.                           |
| `provider.iam.role.path`                | string           | IAM path: `/`, or a path that starts and ends with `/`. Default `/`.                                                   |
| `provider.iam.role.statements`          | list             | IAM policy statements added to the role's inline policy.                                                               |
| `provider.iam.role.managedPolicies`     | list of ARNs     | Managed policies attached to the role.                                                                                 |
| `provider.iam.role.permissionsBoundary` | ARN              | Permissions boundary of the role.                                                                                      |
| `provider.iam.role.tags`                | object           | Tags on the role.                                                                                                      |
| `provider.iam.deploymentRole`           | ARN              | The role CloudFormation uses to deploy the stack (see [Deployment role](#deployment-role)).                            |

`provider.iam.role.statements` and `managedPolicies` are copied into the CloudFormation template, so `Ref`, `Fn::GetAtt`, `Fn::Join` and other intrinsics work in them.

The provider keys `provider.role`, `provider.iamRoleStatements`, `provider.iamManagedPolicies`, `provider.rolePermissionsBoundary` and `provider.cfnRole` are deprecated: use `provider.iam.role`, `provider.iam.role.statements`, `provider.iam.role.managedPolicies`, `provider.iam.role.permissionsBoundary` and `provider.iam.deploymentRole`. `provider.iam.role.permissionBoundary` (singular) is a deprecated spelling of `permissionsBoundary`.

## The default IAM role

The Framework creates one execution role for the service, logical ID `IamRoleLambdaExecution`, and every function without a role of its own uses it. It doesn't create that role when:

- `provider.iam.role` names an existing role (an ARN, a logical ID or an intrinsic), or the deprecated `provider.role` is set;
- every function and every web app sets its own `role`;
- `provider.iam.role.mode` is `perFunction`.

### Permissions in the default role

The default role starts with permission to create and write to the functions' own CloudWatch log groups. For a function with `disableLogs: true`, the role denies `logs:PutLogEvents` on its log group. When any function sets `vpc`, or `provider.vpc` is set, the AWS managed policy `AWSLambdaVPCAccessExecutionRole` is attached so functions can create network interfaces in the VPC.

The Framework also adds permissions for function settings and events that need them, such as `onError`, `destinations`, `kmsKeyArn`, `tracing`, `fileSystemConfig`, `durableConfig`, and stream or queue events. [AWS Lambda functions](./functions.md) names the permission each function setting adds.

### Add statements to the default role

`provider.iam.role.statements` adds IAM policy statements to the default role's inline policy:

```yaml
provider:
  name: aws
  iam:
    role:
      statements:
        - Effect: Allow
          Action: s3:ListBucket
          Resource: arn:aws:s3:::my-bucket-name
        - Effect: Allow
          Action:
            - s3:GetObject
            - s3:PutObject
          Resource: arn:aws:s3:::my-bucket-name/*
```

IAM limits the inline policies of one role to 10,240 characters in total. A service with many functions and event sources can reach that limit on the shared role; give some functions [per-function IAM roles](#per-function-iam-roles) to split the permissions.

### Attach managed policies to the default role

`provider.iam.role.managedPolicies` attaches [managed policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html) to the default role, as ARNs or intrinsics that resolve to ARNs:

```yaml
provider:
  name: aws
  iam:
    role:
      managedPolicies:
        - arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
        - Fn::Join:
            - ''
            - - 'arn:aws:iam::'
              - Ref: AWS::AccountId
              - ':policy/my-team-policy'
```

### Name and path of the default role

The default role's name is `<service>-<stage>-<region>-lambdaRole`, built in CloudFormation as:

```yaml
Fn::Join:
  - '-'
  - - my-service # service
    - dev # stage
    - Ref: AWS::Region
    - lambdaRole
```

IAM role names are limited to 64 characters. To set the name, use `provider.iam.role.name`; to set the path (default `/`), use `provider.iam.role.path`:

```yaml
provider:
  name: aws
  iam:
    role:
      name: my-service-${sls:stage}-lambda
      path: /my-team/
```

## The EventBridge delivery role

A service with an `eventBridge` event on a custom event bus also gets a delivery role, `IamRoleEventBridgeDelivery`, named `<service>-<stage>-<region>-eventBridge`. EventBridge assumes it to invoke the subscribed functions. It is separate from the execution roles and is created in every IAM mode; an event that sets `role` uses that role instead. See [The delivery role](../events/event-bridge.md#the-delivery-role).

## Per-function IAM roles

A per-function role holds only the permissions one function needs, which keeps each role's inline policy small and its access scoped to that function. The Framework creates per-function roles in two ways:

- `provider.iam.role.mode: perFunction` gives every function its own role and creates no shared role.
- In the default `shared` mode, a function that sets `iam.role.statements` or `iam.role.managedPolicies` gets its own role; the other functions keep the shared role.

When a function has its own role, the permissions the Framework adds for it (event sources, `onError`, KMS, logs and the others) go on that role, and the shared role holds the permissions of the functions that still use it. In `shared` mode, the shared role also gets these permissions when any function in the service needs them, even if that function has a role of its own:

- the X-Ray tracing statement, when a function has tracing on
- the `AWSLambdaVPCAccessExecutionRole` managed policy, when a function sets `vpc`
- the `AWSLambdaBasicDurableExecutionRolePolicy` managed policy, when a function sets `durableConfig`
- `execute-api:ManageConnections` on the service's WebSocket API connections, when a function has a `websocket` event
- `edgelambda.amazonaws.com` in the trust policy and CloudWatch Logs write access in every Region, when a function has a `cloudFront` event

[Web apps](./web-apps.md#iam) follow the same rules: `mode: perFunction` gives each web app its own role, and `webApps.<name>.iam` takes the same keys as a function's `iam`.

Per-function roles don't apply when `provider.iam.role` names an existing role, or `provider.role` is set: every function without its own `role` then uses that role. `provider.role` combined with `mode: perFunction` stops packaging with an error. A function that sets `role` uses that role and never gets a per-function role; combining `role` with `iam.role.statements`, `iam.role.managedPolicies` or the legacy `iamRoleStatements` on the same function stops packaging with an error.

### Give every function its own role

With `provider.iam.role.mode: perFunction`, each function's role is built from `provider.iam.role` and the function's own `iam.role`:

```yaml
provider:
  name: aws
  iam:
    role:
      mode: perFunction
      statements: # inherited by every function role
        - Effect: Allow
          Action: s3:ListBucket
          Resource: arn:aws:s3:::shared-assets-${sls:stage}
      managedPolicies:
        - arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess
      permissionsBoundary: arn:aws:iam::123456789012:policy/lambda-boundary
      path: /teams/payments/
      tags:
        Owner: payments

functions:
  list:
    handler: handler.list # gets only the provider settings
  get:
    handler: handler.get
    iam:
      role:
        statements:
          - Effect: Allow
            Action: dynamodb:GetItem
            Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Orders
        managedPolicies:
          - arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess
        tags:
          Feature: read-api
```

- `statements`, `managedPolicies` and `tags` from `provider.iam.role` are combined with the function's own; for a tag key both set, the function's value wins.
- `path`, `name` and `permissionsBoundary` can be set per function under `functions.<name>.iam.role`.
- Provider statements are inherited unless the function sets `iam.inheritStatements: false`.
- `mode: perFunction` needs `provider.iam.role` as an object; an ARN string is an existing shared role.
- When `provider.iam.role.name` is set, every function must set `iam.role.name`: otherwise packaging stops with `Global Role Name is not in expected format`.

### Give selected functions their own role

In the default `shared` mode, set `iam.role.statements` or `iam.role.managedPolicies` on a function to give it a role of its own:

```yaml
provider:
  name: aws
  iam:
    role:
      statements: # used by the shared role; inherited only on request
        - Effect: Allow
          Action:
            - xray:PutTraceSegments
            - xray:PutTelemetryRecords
          Resource: '*'

functions:
  func1:
    handler: handler.func1
    iam:
      inheritStatements: true # default false in shared mode
      role:
        statements:
          - Effect: Allow
            Action: dynamodb:GetItem
            Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Users
        managedPolicies:
          - arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary
        path: /team/app/
        name: ${sls:stage}-func1-role # 64 characters at most
        tags: # merged with provider.iam.role.tags; function keys win
          key: value
  func2:
    handler: handler.func2 # uses the shared role
```

- The function role starts from the shared role's `path`, `tags` and `permissionsBoundary`. `provider.iam.role.managedPolicies` are not attached to it; list the managed policies it needs under the function's `iam.role.managedPolicies`.
- `provider.iam.role.statements` are added to the function role only with `iam.inheritStatements: true`.
- A function with only `iam.role.managedPolicies` gets a role too.

### Names of per-function roles

Without `iam.role.name`, a per-function role is named `<service>-<stage>-<function>-<region>-lambdaRole`. When that passes 64 characters, the `-lambdaRole` suffix is dropped; when it is still longer, packaging stops with an error that asks you to set `iam.role.name`. When `provider.iam.role.name` is set, every function that gets its own role must set `iam.role.name`.

### Legacy per-function IAM keys

The keys of the community plugin `serverless-iam-roles-per-function` still work, and the built-in keys replace them. When the plugin itself is installed, the Framework leaves per-function roles to the plugin and prints a warning that the plugin can be removed.

| Legacy key                                  | Built-in key                                    |
| ------------------------------------------- | ----------------------------------------------- |
| `functions.<name>.iamRoleStatements`        | `functions.<name>.iam.role.statements`          |
| `functions.<name>.iamRoleStatementsInherit` | `functions.<name>.iam.inheritStatements`        |
| `functions.<name>.iamRoleStatementsName`    | `functions.<name>.iam.role.name`                |
| `functions.<name>.iamPermissionsBoundary`   | `functions.<name>.iam.role.permissionsBoundary` |

### Auto-added permissions for per-function roles

The Framework adds these permissions to a per-function role, based on the function's configuration:

| When                                                     | Added to the function's role                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Always                                                   | `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on the function's log group: `logs.logGroup`, else `provider.logs.lambda.logGroup`, else `/aws/lambda/<function name>` (with `-ia` for `infrequent_access`)                                                                          |
| `disableLogs: true`                                      | A statement that denies `logs:PutLogEvents` on that log group                                                                                                                                                                                                                                           |
| The function's `vpc` or `provider.vpc` is set            | Managed policy `AWSLambdaVPCAccessExecutionRole` (also when the function sets `vpc: ~` and `provider.vpc` is set)                                                                                                                                                                                       |
| DynamoDB `stream` event                                  | `dynamodb:GetRecords`, `dynamodb:GetShardIterator`, `dynamodb:DescribeStream`, `dynamodb:ListStreams` on the stream                                                                                                                                                                                     |
| Kinesis `stream` event                                   | `kinesis:GetRecords`, `kinesis:GetShardIterator`, `kinesis:DescribeStream`, `kinesis:ListStreams` on the stream; with `consumer`: `kinesis:GetRecords`, `kinesis:GetShardIterator`, `kinesis:DescribeStreamSummary`, `kinesis:ListShards` on the stream, and `kinesis:SubscribeToShard` on the consumer |
| `stream` event with `destinations.onFailure`             | `sns:Publish` (SNS topic), or `sqs:ListQueues` and `sqs:SendMessage` (SQS queue), on the destination                                                                                                                                                                                                    |
| `sqs` event                                              | `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on the queue                                                                                                                                                                                                                        |
| `onError`                                                | `sns:Publish` on the topic                                                                                                                                                                                                                                                                              |
| `destinations.onSuccess` or `destinations.onFailure`     | `lambda:InvokeFunction`, `sqs:SendMessage`, `sns:Publish` or `events:PutEvents` on the target, by target type                                                                                                                                                                                           |
| `kmsKeyArn` (function or provider) as a plain-string ARN | `kms:Decrypt` on the key                                                                                                                                                                                                                                                                                |
| `durableConfig`                                          | Managed policy `AWSLambdaBasicDurableExecutionRolePolicy`                                                                                                                                                                                                                                               |
| `websocket` event                                        | `execute-api:ManageConnections` on `arn:${AWS::Partition}:execute-api:*:*:*/@connections/*`                                                                                                                                                                                                             |
| `activemq` or `rabbitmq` event                           | `secretsmanager:GetSecretValue` on `basicAuthArn`, `mq:DescribeBroker` on the broker, and the EC2 network interface permissions to reach the broker                                                                                                                                                     |
| `kafka` event                                            | `secretsmanager:GetSecretValue` on the secrets in `accessConfigurations`, and the EC2 network interface permissions when VPC subnets or security groups are set                                                                                                                                         |
| `msk` event                                              | `kafka:DescribeCluster` and `kafka:GetBootstrapBrokers` on the cluster, and the EC2 network interface permissions                                                                                                                                                                                       |
| `cloudFront` event (Lambda@Edge)                         | Trust for `edgelambda.amazonaws.com`, and `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`, `logs:TagResource` on `arn:${AWS::Partition}:logs:*:*:*`, because Lambda@Edge writes logs in the Region closest to each viewer                                                            |
| `schedule` event with `method: scheduler`                | Trust for `scheduler.amazonaws.com`, and `lambda:InvokeFunction` on the function and its versions and aliases                                                                                                                                                                                           |
| `tracing` (on the function or `provider.tracing.lambda`) | `xray:PutTraceSegments`, `xray:PutTelemetryRecords` on `*`                                                                                                                                                                                                                                              |
| `fileSystemConfig`                                       | `elasticfilesystem:ClientMount` and `elasticfilesystem:ClientWrite` (EFS), or `s3files:ClientMount` and `s3files:ClientWrite` (S3 Files), on the access point                                                                                                                                           |

## Custom IAM roles

A custom role is one you define yourself, in `resources` or outside the service, and assign with a `role` key. The Framework doesn't change a custom role: functions that use it get neither `provider.iam.role.statements` nor any of the permissions the Framework adds for their settings and events. The role must grant everything they need, including writing logs and reading their [stream](../events/streams.md) and queue events.

A role can be assigned at two levels:

- `provider.iam.role`: the role for every function that doesn't set its own.
- `functions.<name>.role`: the role for one function, which wins over the provider role.

When every function and every web app has a role, the Framework creates no default role.

`role` takes any of these forms:

- An ARN: `arn:aws:iam::123456789012:role/my-role`.
- The logical ID of a role in `resources`: `myRole` becomes `{ 'Fn::GetAtt': ['myRole', 'Arn'] }`, and the function depends on that role.
- A CloudFormation `Fn::GetAtt`, `Fn::ImportValue` or `Fn::Sub` that resolves to a role ARN.

`serverless deploy function` resolves a logical ID through the role's `RoleName`, so set `RoleName` on roles defined in `resources` if you use that command.

### One custom role for all functions

This example defines a role in `resources` and makes it the role of every function. Its policy grants the log permissions the default role would have had, plus access to one bucket:

```yaml
provider:
  name: aws
  iam:
    role: myDefaultRole

functions:
  func0:
    handler: handler.func0 # uses myDefaultRole
  func1:
    handler: handler.func1 # uses myDefaultRole

resources:
  Resources:
    myDefaultRole:
      Type: AWS::IAM::Role
      Properties:
        Path: /my/default/path/
        RoleName: MyDefaultRole
        AssumeRolePolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
              Action: sts:AssumeRole
        ManagedPolicyArns: # needed for functions in a VPC
          - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: '2012-10-17'
              Statement:
                - Effect: Allow # write the functions' logs
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                    - logs:TagResource
                  Resource:
                    - Fn::Sub: arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*:*:*
                - Effect: Allow
                  Action: s3:PutObject
                  Resource: arn:aws:s3:::my-bucket-name/*
```

`provider.iam.role` also takes an ARN or an intrinsic:

```yaml
provider:
  name: aws
  iam:
    role: arn:aws:iam::123456789012:role/my/default/path/roleInMyAccount
    # or: role: !Sub arn:aws:iam::${AWS::AccountId}:role/roleInMyAccount
```

### A custom role for one function

To give one function its own role while the others keep the default role (or the provider-level custom role), set `role` on that function. The [built-in per-function IAM roles](#per-function-iam-roles) do this without hand-written roles.

```yaml
functions:
  func0:
    handler: handler.func0
    role: myCustRole0
  func1:
    handler: handler.func1 # uses the default role

resources:
  Resources:
    myCustRole0:
      Type: AWS::IAM::Role
      Properties:
        Path: /my/cust/path/
        RoleName: MyCustRole0
        AssumeRolePolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
              Action: sts:AssumeRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: '2012-10-17'
              Statement:
                - Effect: Allow
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                    - logs:TagResource
                  Resource:
                    - Fn::Sub: arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*:*:*
                - Effect: Allow # network interfaces for a function in a VPC
                  Action:
                    - ec2:CreateNetworkInterface
                    - ec2:DescribeNetworkInterfaces
                    - ec2:DetachNetworkInterface
                    - ec2:DeleteNetworkInterface
                  Resource: '*'
```

## Deployment role

By default, CloudFormation creates, updates and deletes the stack with the credentials of whoever runs `serverless deploy` or `serverless remove`. To have CloudFormation use a [service role](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html) instead, set `provider.iam.deploymentRole` to its ARN:

```yaml
provider:
  name: aws
  iam:
    deploymentRole: arn:aws:iam::123456789012:role/cfn-deployment-role
```

The ARN is passed as the stack's role on deploy, rollback and remove. If the service uses Framework custom resources (for example for some S3, Cognito, EventBridge or API Gateway CloudWatch log settings), the custom resource Lambda function also runs with this role instead of a generated one. The role's trust policy must then allow both `cloudformation.amazonaws.com` and `lambda.amazonaws.com`, and the role needs the permissions those custom resources use. `provider.cfnRole` is the deprecated name of this setting.

## Related pages

- [AWS Lambda functions](./functions.md): the function settings that add permissions to Framework-created roles.
- [Events](./events.md): connect functions to event sources; each event page names the permissions it needs.
- [Web apps IAM](./web-apps.md#iam): roles for web apps.
- [AWS credentials](./credentials.md): the credentials the Framework deploys with.
