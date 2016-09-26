<!--
title: IAM Role configuration
menuText: IAM Role configuration
layout: Doc
-->

# Defining IAM Rights

Serverless provides no-configuration rights provisioning by default.  You are welcome.  Yet, if you ungratefully require greater control over rights provisioning it graciously gets out of your way too.  Custom provider or function level roles may be specified either by named reference or by role ARN.

Decision Trees...

<!--
Are there any further concerns or decision points to add?
-->
**Shared or Individual Rights Management?**

<pre>
----------------             -----------------------
|Least _______?|  Effort --> |Optimize Config Time?|  TL;DR! -------------------------|
----------------             -----------------------                                  |
Privilege                     My Disks Are                                            |
|                             |   Endless!                                            |
|------------------------------                                                       |
V                                                                                     V
You Can Has 'Individual/Function-Level' RM!     You Can Has 'Shared/Provider-Level' RM!
</pre>
\* where `D` is `time to deploy` and `N` is the `number of functions in your service`.

<!--
Are there any further concerns or decision points to add?
-->
**Default or Custom Role Management?**

<pre>
------------           --------------------------           ----------------------
|I Can IAM?|  Yes! --> |I Can Has Role & Policy?|  Yes! --> |Serverless Can Does?|
------------           --------------------------           ----------------------
 No :(                  No :(                                No :(           Yes!
 |                      |                                    |                 |
 |------------------------------------------------------------                 |
 V                                                                             V
You Can Has '<a href="#Custom%20Role%20Management">Custom Role Management</a>'!     You Can Has '<a href="#Custom%20Role%20Management">Default Role Management</a>'!
 |
 V
------------           --------------------------
|I Can IAM?|  Yes! --> |Use SLS to Define Roles?|
------------           --------------------------
 No :(                  I Can Does!          Yes!
 |                      |                      |
 |-----------------------                      |
 V                                             V
You Can Has 'roleArn'!        You Can Has 'role'!
</pre>

## <a name="Default Role Management"></a> Default Role Management
The default rights provisioning approach requires no configuration and defines a role that is shared by all of the Lambda functions in your service.  A policy is also created and is attached to the generated role.  Any additional specific rights are added to the role by defining provider level `iamRoleStatements` that will be merged into the generated policy.

### Adding Custom IAM Role Statements to the Default Policy
By default, your lambda functions will be provided with the right to create and write to CloudWatch logs.  Further, if you have specified VPC security groups and subnets for your lambdas to use then the EC2 rights necessary to attach to the VPC via an ENI will be added into the default IAM policy.

If you want to give permission to your functions to access certain resources on your AWS account, you can add custom IAM role statements to your service by adding the statements in the `iamRoleStatements` array in the `provider` object. As those statements will be merged into the CloudFormation template you can use Join, Ref or any other CloudFormation method or feature. You're also able to either use YAML for defining the statement (including the methods) or use embedded JSON if you prefer it. Here's an example that uses all of these:

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

## <a name="Custom Role Management"></a> Custom Role Management
You are an expert.  An AWS genius.  You make right and your lambdas prosper under your rights'eous'ness.  Since this is you, Serverless empowers you to define custom roles and apply them to your functions on a provider or individual function basis.  To do this you must declare a `role` or `roleArn` attribute at the level at which you would like the role to be applied.  Defining it on the provider will make the role referenced by the `role` or `roleArn` value the default role for any lambda without its own `role` or `roleArn` declared.  This is to say that defining a `role` or `roleArn` attribute on individual functions will override any provider level declared role.  If every function within your service has a role assigned to it (either via provider level `role` or `roleArn` declaration, individual declarations, or a mix of the two) then the default role and policy will not be generated and added to your Cloud Formation Template.

The `role` attribute is best to use if your role is defined in your service.  The declaration `{ function: { role: myRole } }` will be translated to `{ function: { roleArn: { 'Fn::GetAtt': ['myRole', 'Arn'] } } }`.  As you can see, terse and easy to declare.  You can of course declare `roleArn` (just as done in the latter of those) but the primary use case is for those who must create their roles and/or policies via a means outside of Serverless.  After all, you're not paranoid if you're after you.  For those cases, see a therapist but otherwise, `roleArn` is for you!

Examples of using these capabilities to specify lambda roles follow.

*MOAR power to the Developers!*&nbsp;&nbsp;&nbsp;&nbsp;`:fist:`

### Provide a single role for all lambdas (via each form of declaration)
```yml
# serverless.yml

service: new-service
provider:
  name: aws
  # declare one of the following...
  role: 'myDefaultRole'                                                   # defining 'role' will override any 'roleArn' declaration // must validly reference a role defined in the service
  roleArn: { 'Fn::GetAtt': ['myDefaultRole', 'Arn'] }                     # must validly reference a role defined in the service
  roleArn: 'arn:aws:iam::0123456789:role//my/default/path/myDefaultRole'  # must validly reference a role defined in your account

functions:
  func0: # will assume 'myDefaultRole'
    ...    # does not define roleArn
  func1: # will assume 'myDefaultRole'
    ...    # does not define roleArn

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
  ...    # does not define roleArn

functions:
  func0: # will assume 'myCustRole0'
    # declare one of the following...
    role: 'myCustRole0'                                                # defining 'role' will override any 'roleArn' declaration // must validly reference a role defined in the service
    roleArn: { 'Fn::GetAtt': ['myCustRole0', 'Arn'] }                  # must validly reference a role defined in the service
    roleArn: 'arn:aws:iam::0123456789:role//my/cust/path/myCustRole0'  # must validly reference a role defined in your account
    ...
  func1: # will assume 'myCustRole1'
    # declare one of the following...
    role: 'myCustRole1'                                                # defining 'role' will override any 'roleArn' declaration // must validly reference a role defined in the service
    roleArn: { 'Fn::GetAtt': ['myCustRole1', 'Arn'] }                  # must validly reference a role defined in the service
    roleArn: 'arn:aws:iam::0123456789:role//my/cust/path/myCustRole1'  # must validly reference a role defined in your account
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
  # declare one of the following...
  role: 'myDefaultRole'                                                   # defining 'role' will override any 'roleArn' declaration // must validly reference a role defined in the service
  roleArn: { 'Fn::GetAtt': ['myDefaultRole', 'Arn'] }                     # must validly reference a role defined in the service
  roleArn: 'arn:aws:iam::0123456789:role//my/default/path/myDefaultRole'  # must validly reference a role defined in your account

functions:
  func0: # will assume 'myCustRole0'
    # declare one of the following...
    role: 'myCustRole0'                                                # defining 'role' will override any 'roleArn' declaration // must validly reference a role defined in the service
    roleArn: { 'Fn::GetAtt': ['myCustRole0', 'Arn'] }                  # must validly reference a role defined in the service
    roleArn: 'arn:aws:iam::0123456789:role//my/cust/path/myCustRole0'  # must validly reference a role defined in your account
    ...
  func1: # will assume 'myDefaultRole'
    ...    # does not define roleArn

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
