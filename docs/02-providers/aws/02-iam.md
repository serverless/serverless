<!--
title: IAM Role configuration
layout: Doc
-->

# Defining IAM Rights

Serverless provides no-configuration rights provisioning by default.  If you require greater control over rights provisioning custom provider or function level roles may be specified.

## Default Role Management
The default right provisioning approach requires no configuration and defines a role that is shared by all of the Lambda functions in your service.  A policy is also created and is attached to the generated role.  Any additional rights are added to the role by defining provider level `iamRoleStatements` that will be merged into the generated policy.

### Adding Custom IAM Role Statements to the Default Policy
If you want to give permission to your functions to access certain resources on your AWS account, you can add custom IAM role statements to your service by adding the statements in the `iamRoleStatements` array in the `provider` object. As those statements will be merged into the CloudFormation template you can use Join, Ref or any other CloudFormation method or feature. You're also able to either use YAML for defining the statement (including the methods) or use embedded JSON if you prefer it. Here's an example that uses all of the above:

```yml
# serverless.yml

service: new-service
provider:
  name: aws
  iamRoleStatements:
      -  Effect: "Allow"
         Action:
           - "s3:ListBucket"
         Resource: { "Fn::Join" : ["", ["arn:aws:s3:::", { "Ref" : "ServerlessDeploymentBucket"} ] ] }
      -  Effect: "Allow"
         Action:
           - "s3:PutObject"
         Resource:
           Fn::Join:
             - ""
             - - "arn:aws:s3:::"
               - "Ref" : "ServerlessDeploymentBucket"
```

On deployment, all these statements will be added to the policy that is applied to the IAM role that is assumed by your lambda functions.

## Custom Role Management
If you require a different rights management strategy, you can define custom roles and apply them to your functions on a provider or individual function basis.  To do this you must declare an `iamRoleARN` attribute at the level at which you would like the role to be applied.  Defining it on the provider will make the role referenced by the `iamRoleARN` value the default role.  Defining the `iamRoleArn` attribute on individual functions will override any provider level declared role.  If every function within your service has a role assigned to it (either via provider level `iamRoleARN` declaration, individual declarations, or a mix of the two) then the default role and policy will not be generated and added to your Cloud Formation Template.

Examples follow.

### Provide a single role for all lambdas
```yml
# serverless.yml

service: new-service
provider:
  name: aws
  iamRoleARN: { 'Fn::GetAtt': ['myDefaultRole', 'Arn'] }

functions:
  func0: # will assume 'myDefaultRole'
    ...    # does not define iamRoleARN
  func1: # will assume 'myDefaultRole'
    ...    # does not define iamRoleARN

resources:
  Resources:
    myDefaultRole:
      Type: AWS::IAM::Role
      RoleName: MyDefaultRole
      Properties:
        Path: /my/default/path
        AssumeRolePolicyDocument:
          Version: 2012-10-17
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
                Action: sts:AssumeRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: 2012-10-17
              Statement:
                - Effect: Allow # note that these rights are given in the default policy and are required if you want logs out of your lambda(s)
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
                -  Effect: "Allow"
                   Action:
                     - "s3:PutObject"
                   Resource:
                     Fn::Join:
                       - ""
                       - - "arn:aws:s3:::"
                         - "Ref" : "ServerlessDeploymentBucket"
```

### Provide individual roles for each lambda
```yml
# serverless.yml

service: new-service
provider:
  name: aws
  ...    # does not define iamRoleARN

functions:
  func0: # will assume 'myCustRole0'
    iamRoleARN: { 'Fn::GetAtt': ['myCustRole0', 'Arn'] }
    ...
  func1: # will assume 'myCustRole1'
    iamRoleARN: { 'Fn::GetAtt': ['myCustRole1', 'Arn'] }
    ...

resources:
  Resources:
    myCustRole0:
      Type: AWS::IAM::Role
      RoleName: MyCustRole0
      Properties:
        Path: /my/cust/path
        AssumeRolePolicyDocument:
          Version: 2012-10-17
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
                Action: sts:AssumeRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: 2012-10-17
              Statement:
                - Effect: Allow
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
                - Effect: Allow
                  Action:
                    - ec2:CreateNetworkInterface
                    - ec2:DescribeNetworkInterfaces
                    - ec2:DetachNetworkInterface
                    - ec2:DeleteNetworkInterface
                  Resource: *
    myCustRole1:
      Type: AWS::IAM::Role
      RoleName: MyCustRole1
      Properties:
        Path: /my/cust/path
        AssumeRolePolicyDocument:
          Version: 2012-10-17
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
                Action: sts:AssumeRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: 2012-10-17
              Statement:
                - Effect: Allow # note that these rights are given in the default policy and are required if you want logs out of your lambda(s)
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
                -  Effect: "Allow"
                   Action:
                     - "s3:PutObject"
                   Resource:
                     Fn::Join:
                       - ""
                       - - "arn:aws:s3:::"
                         - "Ref" : "ServerlessDeploymentBucket"
```

### Provide a default role for all lambdas except those overriding the default
```yml
# serverless.yml

service: new-service
provider:
  name: aws
  iamRoleARN: { 'Fn::GetAtt': ['myDefaultRole', 'Arn'] }

functions:
  func0: # will assume 'myCustRole0'
    iamRoleARN: { 'Fn::GetAtt': ['myCustRole0', 'Arn'] }
    ...
  func1: # will assume 'myDefaultRole'
    ...    # does not define iamRoleARN

resources:
  Resources:
    myDefaultRole:
      Type: AWS::IAM::Role
      RoleName: MyDefaultRole
      Properties:
        Path: /my/default/path
        AssumeRolePolicyDocument:
          Version: 2012-10-17
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
                Action: sts:AssumeRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: 2012-10-17
              Statement:
                - Effect: Allow # note that these rights are given in the default policy and are required if you want logs out of your lambda(s)
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
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
      RoleName: MyCustRole0
      Properties:
        Path: /my/cust/path
        AssumeRolePolicyDocument:
          Version: 2012-10-17
          Statement:
            - Effect: Allow
              Principal:
                Service:
                  - lambda.amazonaws.com
                Action: sts:AssumeRole
        Policies:
          - PolicyName: myPolicyName
            PolicyDocument:
              Version: 2012-10-17
              Statement:
                - Effect: Allow
                  Action:
                    - logs:CreateLogGroup
                    - logs:CreateLogStream
                    - logs:PutLogEvents
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
                - Effect: Allow
                  Action:
                    - ec2:CreateNetworkInterface
                    - ec2:DescribeNetworkInterfaces
                    - ec2:DetachNetworkInterface
                    - ec2:DeleteNetworkInterface
                  Resource: *
```
