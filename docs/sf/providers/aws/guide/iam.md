<!--
title: Serverless Framework - IAM Permissions For Functions
description: How to manage your AWS Lambda functions and their AWS infrastructure resources easily with the Serverless Framework.
short_title: IAM Permissions For Functions
keywords:
  [
    'Serverless Framework',
    'AWS IAM',
    'function permissions',
    'IAM roles',
    'Lambda permissions',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/iam)

<!-- DOCS-SITE-LINK:END -->

# IAM Permissions For Functions

AWS Lambda functions need permissions to interact with other AWS services and resources in your account. These permissions are set via an AWS IAM Role, which the Serverless Framework automatically creates for each service, and is shared by all functions in the service. The Framework allows you to modify this Role or create Function-specific Roles, easily.

You can customize that role to add permissions to the code running in your functions.

You can also create function-specific roles to customize permissions per function.

## At glance

All IAM-related properties of provider are grouped under `iam` property:

```yml
provider:
  iam:
    role:
      name: custom-role-name
      path: /custom-role-path/
      statements:
        - Effect: 'Allow'
          Resource: '*'
          Action: 'iam:DeleteUser'
      managedPolicies:
        - 'arn:aws:iam::123456789012:user/*'
      permissionsBoundary: arn:aws:iam::123456789012:policy/boundaries
      tags:
        key: value
```

Note that `provider.iam.role` can be either an object like in example above, or custom role arn:

```yml
provider:
  iam:
    role: arn:aws:iam::123456789012:role/execution-role
```

## The Default IAM Role

By default, one IAM Role is shared by all the Lambda functions in your service. Also by default, your Lambda functions have permission to create and write to CloudWatch logs. When VPC configuration is provided the default AWS `AWSLambdaVPCAccessExecutionRole` will be associated in order to communicate with your VPC resources.

To add permissions to this role, add IAM statements in `provider.iam.role.statements`. These will be merged into the generated policy. As those statements will be merged into the CloudFormation template, you can use `Join`, `Ref` or any other CloudFormation method or feature.

```yml
service: new-service

provider:
  name: aws
  iam:
    role:
      statements:
        # Allow functions to list all buckets
        - Effect: Allow
          Action: 's3:ListBucket'
          Resource: '*'
        # Allow functions to read/write objects in a bucket
        - Effect: Allow
          Action:
            - 's3:GetObject'
            - 's3:PutObject'
          Resource:
            - 'arn:aws:s3:::my-bucket-name/*'
```

Alongside `provider.iam.role.statements` managed policies can also be added to this service-wide Role, define managed policies in `provider.iam.role.managedPolicies`. These will also be merged into the generated IAM Role so you can use `Join`, `Ref` or any other CloudFormation method or feature here too.

```yml
service: new-service

provider:
  name: aws
  iam:
    role:
      managedPolicies:
        - 'some:aws:arn:xxx:*:*'
        - 'someOther:aws:arn:xxx:*:*'
        - {
            'Fn::Join':
              [':', ['arn:aws:iam:', { Ref: 'AWS::AccountId' }, 'some/path']],
          }
```

### Naming for the Default IAM Role

By default, it uses the following naming convention:

```yml
  'Fn::Join': [
    '-',
    [
      this.provider.serverless.service.service,
      this.provider.getStage(),
      { Ref: 'AWS::Region' },
      'lambdaRole',
    ],
  ],
```

In order to override default name set `provider.iam.role.name` value:

```yml
service: new-service

provider:
  iam:
    role:
      name: your-custom-name-${sls:stage}-role
```

### Path for the Default IAM Role

By default, it will use a path of: `/`

This can be overridden by setting `provider.iam.role.path`:

```yml
service: new-service

provider:
  iam:
    role:
      path: /your-custom-path/
```

## Per-Function IAM Roles

A single IAM role has a 10 KB inline policy size limit. When many functions share one role and its policy grows, CloudFormation can fail with a "Maximum policy size exceeded" error. Per‑function roles split permissions by function so each role’s inline policy stays small, while improving least‑privilege by scoping access to just what each function needs.

Thanks to the community plugin [`serverless-iam-roles-per-function`](https://github.com/functionalone/serverless-iam-roles-per-function) and all its contributors for pioneering per-function IAM roles. This functionality is now built into the Framework; you can safely remove the plugin and use the built-in feature described below.

The Framework can generate dedicated IAM roles per function in two complementary ways:

- **Per‑function IAM with no default role** – set `provider.iam.role.mode: perFunction` to skip the shared service-wide role and give **every** function its own IAM role, even if it does not define any `functions.<name>.iam.role.*` settings.
- **Per‑function IAM on selected functions** – configure `functions.<name>.iam.role.statements` and/or `functions.<name>.iam.role.managedPolicies` to create a dedicated role **only** for specific functions; others continue using the default service role.

At a high level, role synthesis works as follows:

- When `provider.iam.role.mode` is omitted or set to `shared` (default), the Framework creates a single shared execution role for the service. Per‑function roles are only generated for functions that opt in with `functions.<name>.iam.role.*`, and `functions.<name>.iam.inheritStatements` controls whether `provider.iam.role.statements` are merged into those roles.
- When `provider.iam.role.mode: perFunction` is set, the shared execution role is not created. Instead, every function gets its own role derived from `provider.iam.role` (path, tags, permissions boundary, managed policies, and statements), plus any function‑level `iam.role.*` overrides. Role names still follow the standard pattern (or a function‑level `iam.role.name` override); `provider.iam.role.name` does not directly become the per‑function role name. By default, provider‑level statements from `provider.iam.role.statements` are inherited into each per‑function role; you can disable inheritance for a specific function by setting `functions.<name>.iam.inheritStatements: false`.

A number of permissions are added automatically to every generated per-function role (logs, VPC access, stream/SQS consumers, DLQ publish and more). See [Auto-Added Permissions for Per-Function Roles](#auto-added-permissions-for-per-function-roles) for details.

### Per‑function IAM with no default role

```yml
service: new-service

provider:
  name: aws
  iam:
    role:
      # Enable per-function mode that skips the shared service-wide role
      mode: perFunction
      # Base IAM config inherited by every function role
      statements:
        - Effect: Allow
          Action:
            - s3:ListBucket
          Resource:
            - arn:aws:s3:::shared-assets-${sls:stage}
      managedPolicies:
        - arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess
      permissionsBoundary: arn:aws:iam::123456789012:policy/lambda-boundary
      path: /teams/payments/
      tags:
        Owner: payments
        Environment: ${sls:stage}

functions:
  list:
    handler: handler.list
    # Inherits provider.iam.role.* (statements, managedPolicies, path, boundary, tags)

  get:
    handler: handler.get
    iam:
      # Function can still extend provider-level configuration
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

Notes:

- When `provider.iam.role.mode: perFunction` is set, the Framework creates a distinct IAM role for every function in the service.
- Each role inherits the list-like fields from `provider.iam.role` (`statements`, `managedPolicies`, `tags`) and can extend them with additional function-level values.
- Non‑list fields such as `path`, `name`, and `permissionsBoundary` can be overridden per function via `functions.<name>.iam.role.*`.
- `provider.role` and `provider.iam.role.mode: perFunction` cannot be combined.
- `provider.iam.role.mode: perFunction` only applies when `provider.iam.role` is an object. If you configure `provider.iam.role` as a string/ARN, it is treated as a shared service-wide role and the per-function mode is disabled.
- In this mode, provider-level statements from `provider.iam.role.statements` are inherited into each generated per-function role by default. To prevent inheritance for a specific function, set `functions.<name>.iam.inheritStatements: false`.
- If `functions.<name>.role` is set, that function always uses the explicit custom role and does not receive an automatically generated per-function role.

### Per‑function IAM on selected functions

```yml
service: new-service

provider:
  name: aws
  iam:
    role:
      # Global statements can be inherited into per-function roles
      statements:
        - Effect: Allow
          Action:
            - xray:PutTraceSegments
            - xray:PutTelemetryRecords
          Resource: '*'

functions:
  func1:
    handler: handler.func1
    iam:
      inheritStatements: true # Merge provider.iam.role.statements into this function role (default: false)
      role:
        statements: # Inline statements added to this function's dedicated role
          - Effect: Allow
            Action:
              - dynamodb:GetItem
            Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Users
        managedPolicies: # Attach IAM Managed Policies to the function role (optional)
          - arn:aws:iam::aws:policy/ReadOnlyAccess
        permissionsBoundary: arn:aws:iam::123456789012:policy/boundary # Optional permissions boundary
        path: /team/app/ # Optional IAM path for the function role
        name: ${sls:stage}-func1Role # Optional explicit role name (ensure total length ≤ 64)
        tags: # Optional; merged with provider.iam.role.tags (function keys override)
          key: value
  func2:
    handler: handler.func2
    # Uses the default service-wide IAM role (no per-function iam.role.* configured)
```

Notes:

- A per-function role is created when `iam.role.statements` or `iam.role.managedPolicies` is set on the function.
- Per-function roles are not generated when a provider-level role is configured. If `provider.role` is set, or `provider.iam.role` references an existing role (ARN/CFN reference/object that resolves to an ARN), all functions use that role.
- Use `iam.inheritStatements: true` to merge `provider.iam.role.statements` into the function role in this mode.
- Do not combine per-function IAM statements/managed policies (`functions.<name>.iam.*`) with custom IAM role `functions.<name>.role`.
- `iam.role.tags` are merged with provider tags; function-level keys take precedence.
- If you do not set `iam.role.name`, the Framework uses the default pattern `<service>-<stage>-<functionName>-<region>-lambdaRole`. If it exceeds 64 characters, the `-lambdaRole` suffix is removed; if still over 64 characters, an error is thrown.
- Legacy `serverless-iam-roles-per-function` plugin function-level fields remain supported in the current major version; you should migrate to the structured equivalents:
  - `functions.<name>.iamRoleStatements` → `functions.<name>.iam.role.statements`
  - `functions.<name>.iamRoleStatementsInherit` → `functions.<name>.iam.inheritStatements`
  - `functions.<name>.iamRoleStatementsName` → `functions.<name>.iam.role.name`
  - `functions.<name>.iamPermissionsBoundary` → `functions.<name>.iam.role.permissionsBoundary`

### Auto-Added Permissions for Per-Function Roles

When a per-function role is generated, the Framework augments it with sensible defaults and event-driven permissions:

- CloudWatch Logs (always)
  - Adds permissions to create/write logs for the function's log group:
    - `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` on the resolved log group.
    - Resolved Log Group precedence:
      1. `functions.<name>.logs.logGroup`
      2. `provider.logs.lambda.logGroup`
      3. default `/aws/lambda/<functionName>`.

- VPC access (when VPC is configured)
  - If `functions.<name>.vpc` or `provider.vpc` is set: attaches managed policy `arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole`.

- Streams event sources (when used)
  - For each `events[].stream`:
    - DynamoDB streams: `dynamodb:GetRecords`, `dynamodb:GetShardIterator`, `dynamodb:DescribeStream`, `dynamodb:ListStreams` on specified stream ARNs.
    - Kinesis streams: `kinesis:GetRecords`, `kinesis:GetShardIterator`, `kinesis:DescribeStream`, `kinesis:ListStreams` on specified stream ARNs.

- SQS event sources (when used)
  - For each `events[].sqs`: `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on the specified queue ARN(s).

- Dead Letter Queue publish (when used)
  - If `functions.<name>.onError` references an SNS topic ARN: `sns:Publish` on that ARN.

- WebSockets API (when used)
  - If the function has WebSockets events, adds `execute-api:ManageConnections` on `arn:${AWS::Partition}:execute-api:*:*:*/@connections/*` so it can post to WebSocket connections.

- Amazon MQ / RabbitMQ (when used)
  - For `activemq`/`rabbitmq` events:
    - Adds `secretsmanager:GetSecretValue` on the configured `basicAuthArn` secrets.
    - Adds `mq:DescribeBroker` on the configured broker ARNs.
    - Adds EC2 networking permissions (`ec2:CreateNetworkInterface`, `Describe*`, `DeleteNetworkInterface`) required to connect to the brokers.

- Kafka / MSK (when used)
  - For `kafka` events:
    - Adds `secretsmanager:GetSecretValue` on the Secrets Manager ARNs referenced in access configurations (`saslPlainAuth`, `saslScram*Auth`, `clientCertificateTlsAuth`, `serverRootCaCertificate`).
    - Adds EC2 networking permissions when VPC subnets/security groups are configured.
  - For `msk` events:
    - Adds `kafka:DescribeCluster` and `kafka:GetBootstrapBrokers` on the cluster ARNs.
    - Adds EC2 networking permissions for MSK connectivity.

- CloudFront / Lambda@Edge (when used)
  - For functions with `cloudFront` events:
    - Extends the assume-role trust so `edgelambda.amazonaws.com` can assume the function role (in addition to `lambda.amazonaws.com`).
    - Adds a broad CloudWatch Logs policy so Lambda@Edge executions can create/write log groups and streams in the closest regions.

- EventBridge Scheduler (when used)
  - For `schedule` events configured with `method: scheduler`:
    - Extends the assume-role trust so `scheduler.amazonaws.com` can assume the function role.
    - Adds `lambda:InvokeFunction` on the function ARN and all its versions/aliases, matching the scheduler execution role requirements.

- AWS X-Ray (when tracing is enabled)
  - When function‑level or provider‑level Lambda tracing is enabled, adds:
    - `xray:PutTraceSegments`
    - `xray:PutTelemetryRecords`
      on `*`.

- EFS access (when `fileSystemConfig` is used)
  - If `functions.<name>.fileSystemConfig.arn` is set, adds:
    - `elasticfilesystem:ClientMount`
    - `elasticfilesystem:ClientWrite`
      on that EFS access point ARN.

Example:

```yml
functions:
  func1:
    handler: handler.func1
    # SQS and Streams events automatically grant minimal read permissions
    # WebSockets, MQ, Kafka/MSK, CloudFront, Scheduler, X-Ray and EFS will also
    # add the necessary IAM permissions when configured below.
    events:
      - sqs: arn:aws:sqs:${aws:region}:${aws:accountId}:myQueue
      - stream:
          arn: arn:aws:kinesis:${aws:region}:${aws:accountId}:stream/myStream
      - websocket:
          route: $default
      - activemq:
          arn: arn:aws:mqa:${aws:region}:${aws:accountId}:broker/my-mq:b-123456
          basicAuthArn: arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:mq-cred
          queue: orders
      - kafka:
          topic: orders-topic
          bootstrapServers:
            - b-1.example.kafka.amazonaws.com:9092
          accessConfigurations:
            vpcSubnet:
              - subnet-abc
            vpcSecurityGroup: sg-123456
            saslScram512Auth: arn:aws:secretsmanager:${aws:region}:${aws:accountId}:secret:kafka-cred
      - msk:
          arn: arn:aws:kafka:${aws:region}:${aws:accountId}:cluster/my-msk-cluster/1234567890abcdef
          topic: msk-orders
      - cloudFront:
          origin: s3://my-bucket.s3.amazonaws.com/
          eventType: viewer-request
      - schedule:
          rate: rate(5 minutes)
          method: scheduler
          enabled: true
    # Custom log group; log permissions will target this group
    logs:
      logGroup: /aws/lambda/custom-log-group
    # VPC configured; VPC access managed policy will be attached automatically
    vpc:
      securityGroupIds: [sg-123456]
      subnetIds: [subnet-abc, subnet-def]
    # DLQ publish permission will be added for this SNS topic
    onError: arn:aws:sns:${aws:region}:${aws:accountId}:myDlqTopic
    # EFS access will add elasticfilesystem:ClientMount / ClientWrite permissions
    fileSystemConfig:
      arn: arn:aws:elasticfilesystem:${aws:region}:${aws:accountId}:access-point/fsap-123456
      localMountPath: /mnt/efs
    iam:
      role:
        statements:
          - Effect: Allow
            Action: dynamodb:GetItem
            Resource: arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/Items
```

### Per-Function Role: managed policies only

You can create a per-function role by specifying only `managedPolicies`:

```yml
functions:
  func2:
    handler: handler.func2
    iam:
      role:
        managedPolicies:
          - arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess
```

## Custom IAM Roles

**WARNING:** You need to take care of the overall role setup as soon as you define custom roles.

That means that `iam.statements` you've defined on the `provider` level won't be applied anymore. Furthermore, you need to provide the corresponding permissions for your Lambdas `logs` and [`stream`](../events/streams.md) events.

Serverless empowers you to define custom roles and apply them to your functions on a provider or individual function basis. To do this, you must declare a `role` attribute at the level at which you would like the role to be applied.

Defining it on the provider will make the role referenced by the `role` value the default role for any Lambda without its own `role` declared. This is to say that defining a `role` attribute on individual functions will override any provider level declared role. If every function within your service has a role assigned to it (either via provider level `role` declaration, individual declarations, or a mix of the two) then the default role and policy will not be generated and added to your Cloud Formation Template.

The `role` attribute can have a value of the logical name of the role, the ARN of the role, or an object that will resolve in the ARN of the role. The declaration `{ function: { role: 'myRole' } }` will result in `{ 'Fn::GetAtt': ['myRole', 'Arn'] }`. You can of course just declare an ARN like so `{ function: { role: 'an:aws:arn:xxx:*:*' } }`. This use case is primarily for those who must create their roles and / or policies via a means outside of Serverless.

Here are some examples of using these capabilities to specify Lambda roles.

### One Custom IAM Role For All Functions

```yml
service: new-service

provider:
  name: aws
  # declare one of the following...
  iam:
    role: myDefaultRole                                                  # must validly reference a role defined in the service
    role: arn:aws:iam::0123456789:role//my/default/path/roleInMyAccount  # must validly reference a role defined in your account
    role:                                                                # must validly resolve to the ARN of a role you have the rights to use
      Fn::GetAtt:
        - myRole
        - Arn
    role: !Sub arn:aws:iam::${AWS::AccountId}:role/roleInMyAccount

functions:
  func0: # will assume 'myDefaultRole'
    ... # does not define role
  func1: # will assume 'myDefaultRole'
    ... # does not define role

resources:
  Resources:
    myDefaultRole:
      Type: AWS::IAM::Role
      Properties:
        Path: /my/default/path/
        RoleName: MyDefaultRole # required if you want to use 'serverless deploy --function' later on
        AssumeRolePolicyDocument:
          Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
              Action: sts:AssumeRole
        # note that these rights are needed if you want your function to be able to communicate with resources within your vpc
        ManagedPolicyArns:
          - arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: '2012-10-17'
              Statement:
                - Effect: Allow # note that these rights are given in the default policy and are required if you want logs out of your lambda(s)
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                    - logs:TagResource
                  Resource:
                    - 'Fn::Join':
                      - ':'
                      -
                        - 'arn:aws:logs'
                        - Ref: 'AWS::Region'
                        - Ref: 'AWS::AccountId'
                        - 'log-group:/aws/lambda/*:*:*'
                -  Effect: "Allow"
                   Action:
                     - "s3:PutObject"
                   Resource:
                     Fn::Join:
                       - ""
                       - - "arn:aws:s3:::"
                         - "Ref" : "ServerlessDeploymentBucket"
```

### Custom IAM Roles For Each Function

It is possible to create one IAM role for each function.

To achieve this, either use the [`serverless-iam-roles-per-function` plugin](https://www.serverless.com/plugins/serverless-iam-roles-per-function), or configure AWS resources manually as shown below:

```yml
service: new-service

provider:
  name: aws
  ... # does not define role

functions:
  func0:
    role: myCustRole0
    ...
  func1:
    role: myCustRole1
    ...

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
                    - 'Fn::Join':
                      - ':'
                      -
                        - 'arn:aws:logs'
                        - Ref: 'AWS::Region'
                        - Ref: 'AWS::AccountId'
                        - 'log-group:/aws/lambda/*:*:*'
                - Effect: Allow
                  Action:
                    - ec2:CreateNetworkInterface
                    - ec2:DescribeNetworkInterfaces
                    - ec2:DetachNetworkInterface
                    - ec2:DeleteNetworkInterface
                  Resource: "*"
    myCustRole1:
      Type: AWS::IAM::Role
      Properties:
        Path: /my/cust/path/
        RoleName: MyCustRole1
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
                - Effect: Allow # note that these rights are given in the default policy and are required if you want logs out of your lambda(s)
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                    - logs:TagResource
                  Resource:
                    - 'Fn::Join':
                      - ':'
                      -
                        - 'arn:aws:logs'
                        - Ref: 'AWS::Region'
                        - Ref: 'AWS::AccountId'
                        - 'log-group:/aws/lambda/*:*:*'
                -  Effect: "Allow"
                   Action:
                     - "s3:PutObject"
                   Resource:
                     Fn::Join:
                       - ""
                       - - "arn:aws:s3:::"
                         - "Ref" : "ServerlessDeploymentBucket"
```

### A Custom Default Role & Custom Function Roles

```yml
service: new-service

provider:
  name: aws
  iam:
    role: myDefaultRole

functions:
  func0:
    role: myCustRole0
    ...
  func1:
    ... # does not define role

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
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: '2012-10-17'
              Statement:
                - Effect: Allow # note that these rights are given in the default policy and are required if you want logs out of your lambda(s)
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                    - logs:TagResource
                  Resource:
                    - 'Fn::Join':
                      - ':'
                      -
                        - 'arn:aws:logs'
                        - Ref: 'AWS::Region'
                        - Ref: 'AWS::AccountId'
                        - 'log-group:/aws/lambda/*:*:*'
                -  Effect: "Allow"
                   Action:
                     - "s3:PutObject"
                   Resource:
                     Fn::Join:
                       - ""
                       - - "arn:aws:s3:::"
                         - "Ref" : "ServerlessDeploymentBucket"
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
                    - 'Fn::Join':
                      - ':'
                      -
                        - 'arn:aws:logs'
                        - Ref: 'AWS::Region'
                        - Ref: 'AWS::AccountId'
                        - 'log-group:/aws/lambda/*:*:*'
                - Effect: Allow
                  Action:
                    - ec2:CreateNetworkInterface
                    - ec2:DescribeNetworkInterfaces
                    - ec2:DetachNetworkInterface
                    - ec2:DeleteNetworkInterface
                  Resource: "*"

```
