<!--
title: Serverless Dashboard - List of all Safeguards
menuText: List of all Safeguards
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/safeguards/)

<!-- DOCS-SITE-LINK:END -->

# List of all available safeguards

The following policies are included and configurable in the [Serverless
Framework Dashboard](https://dashboard.serverless.com/).

### No "\*" in IAM Role statements

**ID: no-wild-iam-role-statements**

This policy performs a simple check to prevent "\*" permissions being used in
AWS IAM Roles by checking for wildcards on Actions and Resources in grant
statements.

#### Resolution

Update the [custom IAM Roles](https://serverless.com/framework/docs/providers/aws/guide/iam#custom-iam-roles)
in the `serverless.yml` to remove IAM Role Statements which grant access to "\*"
on Actions and Resources. If a plugin generates IAM Role Statements, follow the
instructions provided by the plugin developer to mitigate the issue.

### No clear-text credentials in environment variables

**ID: no-secret-env-vars**

Ensures that the [environment variables configured on the AWS Lambda functions](https://serverless.com/framework/docs/providers/aws/guide/functions#environment-variables)
do not contain environment variables values which follow patterns of common
credential formats.

#### Resolution

Resolving this issue requires that the AWS Lambda function environment variables
do not contain any plain-text credentials; however, your functions may still
require those credentials to be passed in by other means.

There are two recommended alternatives of passing in credentials to your AWS
Lambda functions:

- **SSM Parameter Store**: The article "[You should use SSM Parameter Store over Lambda env variables](https://hackernoon.com/you-should-use-ssm-parameter-store-over-lambda-env-variables-5197fc6ea45b)"
  by Yan Cui provides a detailed explanation for using the SSM Parameters in your
  Serverless Framework service to save and retrieve credentials.
- **KMS Encryption**: Encrypt the environment variables using [KMS Keys](https://serverless.com/framework/docs/providers/aws/guide/functions#kms-keys).

### Ensure Dead Letter Queues are attached to functions

**ID: require-dlq**

Ensures all functions with any of the events listed below, or functions with
zero events, have an attached [Dead Letter Queue](https://docs.aws.amazon.com/lambda/latest/dg/dlq.html).

**Events:**

- s3
- sns
- alexaSkill
- iot
- cloudwachEvent
- coudwatchLog
- cognitoUserPool
- alexaHomeSkill

#### Resolution

Configure the [Dead Letter Queue with SNS or SQS](https://serverless.com/framework/docs/providers/aws/guide/functions#dead-letter-queue-dlq)
for all the functions which require the DLQ to be configured.

### Allowed Runtimes

**ID: allowed-runtimes**

This limits the runtimes that can be used in services. It is configurable with a list of allowed
runtimes or a regular expression.

```yaml
- nodejs8.10
- python3.7
# or:
node.*
```

#### Resolution

Ensure you are using a runtime that is in the list of allowed runtimes or matches the regex of
allowed runtimes.

### Allowed stages

**ID: allowed-stages**

This limits the stages that can be used in services. It is configurable with a list of allowed
stages or a regular expression.

```yaml
- prod
- dev
# or:
'(prod|qa|dev-.*)'
```

#### Resolution

Ensure you are using a runtime that is in the list of allowed stages or matches the regex of
allowed stages.

### Framework Version

**ID: framework-version**

This policy limits which versions of the Serverless Framework can be used. It is configured with a
[semver](https://semver.org/) expression.

```yaml
>=1.44.0 <2.0.0
```

#### Resolution

Install an allowed version of the framework: `npm i -g serverless@$ALLOWED_VERSION`

### Require Cloudformation Deployment Role

**ID: require-cfn-role**

This rule requires you to specify the
[`cfnRole` option](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/)
in your `serverless.yml`. It has no
configuration options.

#### Resolution

Add `cfnRole` to your `serverless.yml`.

### Required stack tags

**ID: required-stack-tags**

This rule requires you to specify certain tags in the
[`stackTags` option](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/)
in your `serverless.yml`. It is configured with a mapping of keys to regex's. All the keys must be
present and value must match the regex.

```yaml
someTagName: '.*'
```

### Require Global VPC

**ID: require-global-vpc**

This rule requires all your functions to be configured with a VPC. By default they are required to
have at least two subnet IDs to allow for AZ failover. It is configurable with a `minNumSubnets`
option:

```yaml
minNumSubnets: 1 # if you don't want to require 2 and AZ support
```

#### Resolution

Add a global VPC configuration to your config:
https://serverless.com/framework/docs/providers/aws/guide/functions/#vpc-configuration

### Allowed function names

**ID: allowed-function-names**

This rule allows you enforce naming conventions functions deployed to AWS lambda.
It is configured with a regular expression. It features one extra addition: variables for stage,
service and function(the key in the serverless yaml) names. See below for some examples.

Require using Serverless's standard naming scheme:

```
${SERVICE}-${STAGE}-${FUNCTION}
```

Or, if you want custom names with stage first and underscores instead of dashes:

```
${STAGE}_${SERVICE}_${FUNCTION}
```

#### Resolution

Use the `name:` config option on the function object to customize the deployed function name to
match the regex: https://serverless.com/framework/docs/providers/aws/guide/functions/#configuration

### Require Description

**ID: require-description**

This rule requires that all functions have a description of minimum or maximum length. By default
it requires a minimum length of 30 and the lambda maximum of 256. Both these values are
configurable however. Here is a config that requires a slightly longer config but doesn't allow as
long a maximum:

```yaml
minLength: 50
maxLength: 100
```

#### Resolution

Add a function description to all your lambdas that is with in the minimum and maximum required
lengths.

### Allowed Regions

**ID: allowed-regions**

This rule allows you to restrict the regions to which a service may be deployed. It is configured
with a list of regions:

```yaml
# eg, us-east-1 and us-west-2 only
- us-east-1
- us-west-2
```

### Restricted deploy times

**ID: restricted-deploy-times**

This policy blocks deploys at certain times. It is configured with a list of objects containing a
time, duration and optional interval.

```yaml
# no deploy specific holidays, eg Rosh Hashanah 2019
- time: 2019-09-29T18:20 # ISO8601 date or datetime
  duration: P2D30M # IS8601 duration
# no deploy a specific day but repeating, eg all future Christmases
- time: 2019-12-25
  duration: P1D
  interval: P1Y
# no deploy fri noon - monday 6AM
- time: 2019-03-08T12:00:00
  duration: P2D18H
  interval: P1W
```

If you only need to specify one interval you can also directly use that object, eg:

```yaml
# no deployments on friday, saturday, sunday
time: 2019-03-08
duration: P3D
interval: P1W
```

#### Resolution

Wait! You're not supposed to be deploying!

### Forbid S3 HTTP Access

**ID: forbid-s3-http-access**

This policy requires that you have a `BucketPolicy` forbidding access over HTTP for each bucket.
There are no configuration options.

#### Resolution

For a bucket without a name such as the `ServerlessDeploymentBucket` ensure that the `resources`
section of your serverless yaml contains a policy like the following using `Ref`s.
If using a different bucket, update the logical name in the `Ref`.

```yaml
resources:
  Resources:
    ServerlessDeploymentBucketPolicy:
      Type: 'AWS::S3::BucketPolicy'
      Properties:
        Bucket: { Ref: ServerlessDeploymentBucket }
        PolicyDocument:
          Statement:
            - Action: 's3:*'
              Effect: 'Deny'
              Principal: '*'
              Resource:
                Fn::Join:
                  - ''
                  - - 'arn:aws:s3:::'
                    - Ref: ServerlessDeploymentBucket
                    - '/*'
              Condition:
                Bool:
                  aws:SecureTransport: false
```

If using a bucket with a name, say configured in the `custom` section of your config, use a policy
like this:

```yaml
resources:
  Resources:
    NamedBucketPolicy:
      Type: 'AWS::S3::BucketPolicy'
      Properties:
        Bucket: ${self:custom.bucketName}
        PolicyDocument:
          Statement:
            - Action: 's3:*'
              Effect: 'Deny'
              Principal: '*'
              Resource: 'arn:aws:s3:::${self:custom.bucketName}/*'
              Condition:
                Bool:
                  aws:SecureTransport: false
```
