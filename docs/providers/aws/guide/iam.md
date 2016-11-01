<!--
title: Serverless Framework - AWS Lambda Guide - IAM
menuText: IAM
menuOrder: 12
description: How to set up the different roles on a service and function level
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/iam)
<!-- DOCS-SITE-LINK:END -->

# Defining IAM Rights

Serverless provides no-configuration rights provisioning by default.
However you can always define roles on a service or function level if you need to.

## Default Role Management

The default rights provisioning approach requires no configuration and defines a role that is shared by all of the Lambda functions in your service. A policy is also created and is attached to the generated role. Any additional specific rights are added to the role by defining provider level `iamRoleStatements` that will be merged into the generated policy.

### Adding Custom IAM Role Statements to the Default Policy

By default, your Lambda functions will be provided with the right to create and write to CloudWatch logs. Further, if you have specified VPC security groups and subnets for your lambdas to use then the EC2 rights necessary to attach to the VPC via an ENI will be added into the default IAM policy.

If you want to give permission to your functions to access certain resources on your AWS account, you can add custom IAM role statements to your service by adding the statements in the `iamRoleStatements` array in the `provider` object. As those statements will be merged into the CloudFormation template you can use `Join`, `Ref` or any other CloudFormation method or feature. You're also able to either use YAML for defining the statement (including the methods) or use embedded JSON if you prefer it. Here's an example that uses all of these:

```yml
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

On deployment, all these statements will be added to the policy that is applied to the IAM role that is assumed by your Lambda functions.

## Custom Role Management

Serverless empowers you to define custom roles and apply them to your functions on a provider or individual function basis. To do this you must declare a `role` attribute at the level at which you would like the role to be applied.

Defining it on the provider will make the role referenced by the `role` value the default role for any Lambda without its own `role` declared. This is to say that defining a `role` attribute on individual functions will override any provider level declared role. If every function within your service has a role assigned to it (either via provider level `role` declaration, individual declarations, or a mix of the two) then the default role and policy will not be generated and added to your Cloud Formation Template.

The `role` attribute can have a value of the logical name of the role, the ARN of the role, or an object that will resolve in the ARN of the role. The declaration `{ function: { role: 'myRole' } }` will result in `{ 'Fn::GetAtt': ['myRole', 'Arn'] }`. You can of course just declare an ARN like so `{ function: { role: 'an:aws:arn:xxx:*:*' } }`. This use case is primarily for those who must create their roles and / or policies via a means outside of Serverless.

Here are some examples of using these capabilities to specify Lambda roles.

### Provide a single role for all lambdas (via each form of declaration)

```yml
service: new-service

provider:
  name: aws
  # declare one of the following...
  role: myDefaultRole                                                # must validly reference a role defined in the service
  role: arn:aws:iam::0123456789:role//my/default/path/myDefaultRole  # must validly reference a role defined in your account
  role: { 'Fn::GetAtt': ['myDefaultRole', 'Arn'] }                   # must validly resolve to the ARN of a role you have the rights to use

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
        Path: /my/default/path
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

### Provide individual roles for each Lambda

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
        Path: /my/cust/path
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
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
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
        Path: /my/cust/path
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

### Provide a default role for all Lambdas except those overriding the default

```yml
service: new-service

provider:
  name: aws
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
        Path: /my/default/path
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
      Properties:
        Path: /my/cust/path
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
                  Resource: arn:aws:logs:${region}:${accountId}:log-group:/aws/lambda/*:*:*
                - Effect: Allow
                  Action:
                    - ec2:CreateNetworkInterface
                    - ec2:DescribeNetworkInterfaces
                    - ec2:DetachNetworkInterface
                    - ec2:DeleteNetworkInterface
                  Resource: "*"
```
