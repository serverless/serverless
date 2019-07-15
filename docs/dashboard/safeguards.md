<!--
title: Serverless Dashboard - Safeguards
menuText: Safeguards
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/safeguards/)

<!-- DOCS-SITE-LINK:END -->

# Safeguards

Safeguards performs a series of policy checks when running the `serverless
deploy` command. There are [fourteen policies](#default-policies) included which you can [configure in the dashboard](#configuring-policies). Additionally [custom policies](#custom-policies) can be created and added to your serverless project.

## Available Policies

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
in your `serverless.yml`. It is configured with a mapping of keys to regexes. All the keys must be
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
It is confgured with a regular expression. It features one extra addition: variables for stage,
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
# no deploy specific holidiays, eg Rosh Hashanah 2019
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
      Type: "AWS::S3::BucketPolicy"
      Properties: 
        Bucket: {Ref: ServerlessDeploymentBucket}
        PolicyDocument:
          Statement:
            - Action: "s3:*"
              Effect: "Deny"
              Principal: "*"
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
      Type: "AWS::S3::BucketPolicy"
      Properties: 
        Bucket: ${self:custom.bucketName}
        PolicyDocument:
          Statement:
            - Action: "s3:*"
              Effect: "Deny"
              Principal: "*"
              Resource: 'arn:aws:s3:::${self:custom.bucketName}/*'
              Condition:
                Bool:
                  aws:SecureTransport: false
```


## Running Policy Checks

The policy checks are performed as a part of the `serverless deploy` command.
This will load the safeguard settings from the `serverless.yml` file to
determine which policies to evaluate.

**Example deploy**
```
$ sls deploy
...
Serverless Enterprise: Safeguards Results:

   Summary --------------------------------------------------

   passed - require-dlq
   passed - allowed-runtimes
   passed - no-secret-env-vars
   passed - allowed-stages
   failed - require-cfn-role
   passed - allowed-regions
   passed - framework-version
   failed - no-wild-iam-role-statements

   Details --------------------------------------------------

   1) Failed - no cfnRole set
      details: https://git.io/fhpFZ
      Require the cfnRole option, which specifies a particular role for CloudFormation to assume while deploying.


   2) Failed - iamRoleStatement granting Resource='*'. Wildcard resources in iamRoleStatements are not permitted.
      details: https://git.io/fjfk7
      Prevent "*" permissions being used in AWS IAM Roles by checking for wildcards on Actions and Resources in grant statements.


Serverless Enterprise: Safeguards Summary: 6 passed, 0 warnings, 2 errors
...
```

### Policy check results

When a policy check is performed, the policy can respond with a **pass**,
**fail** or **warning**. A fail will block and prevent the deploy from
occurring. A warning will display a message but the deploy will continue. 

If one or more of the policy checks fail the command will return a 1 exit code so
it can be detected from a script or CI/CD service.

## Configuring Policies
Safeguard policies are managed in the [Serverless Framework Dashboard](https://dashboard.serverless.com/). When you run `serverless deploy`, the CLI obtains the latest list of Safeguard policies and performs the checks before any resources are provisioned or deployed.

The list of available Safeguards can be found by navigating to the "profiles" page, selecting the individual profile and opening the "safeguards" tab. The guide on [using deployment profiles to deploy](./profiles.md#using-a-deployment-profile-to-deploy) provides instructions to identify the profile used by your application and stage.

When creating a new Safeguard policy you must specify each of the following fields:

### name
This is a user-readable name for the Safeguard policy. When the policy check is run in the CLI, the Safeguard policy name is used in the output. 

### description
The description should explain the intent of the policy. When the Safeguard policy check runs in the CLI this description will be displayed if the policy check fails. It is recommended that the description provides instructions on how to resolve an issue if the service is not compliant with the policy. 

### safeguard
The safeguard dropdown lists all of the [available policies](#available-policies). Select the Safeguard you want to enforce. When you select the Safeguard the description and the settings will be populated for you with default values.

### enforcement level
The enforcement level can be set to either `warning` or `error`.  When the Safeguard policy check runs in the CLI and the policy check passes, then enforcement level will have no impact on the deployment. However, if the policy check fails, then the enforcement level will control if the deployment can continue. If the enforcement level is set to `warning`, then the CLI will return a warning message but the deployment will continue. If the enforcement level is set to `error`, then the CLI will return an error message and the deployment will be blocked from continuing.

### settings
Some of the [available safeguards](#available-safeguards) may allow or require configurations. For example, the [Allowed Runtimes (allowed-runtimes)](#allowed-runtimes) Safeguard requires a list of allowed AWS Lambda Runtimes for functions. This field allows you to customize the settings for the Safeguard policy.


## Custom Policies

In addition to built-in policies configurable in the Serverless Framework Dashboard, you can add custom policies to your application.

### Creating a custom policy

A policy is simply a Javascript packaged in a module export. To start with a
custom policy first create a directory in your working directory
(e.g. `./policies`) to store the policy files.

Create a single JS file to define your policy (e.g. `my-custom-policy.js`) in the
policies directory.

**./policies/my-custom-policy.js**
```javascript
module.exports = function myCustomPolicy(policy, service) {
  // policy.fail(“Configuration is not compliant with policy”)
  policy.approve()
}
```

There are two primary methods you can use to control the behavior of the policy checks
when running the `deploy` command.

- `approve()` - Passes the policy to allow the deploy to continue.
- `fail(message)` - Fails the policy check and returns an failure message. 

To define the policy method you’ll need to inspect the configuration. The entire
configuration is made available in the service object. Use the [default policies](https://github.com/serverless/enterprise-plugin/tree/master/src/lib/safeguards/policies)
and [example policies](https://github.com/serverless/enterprise-plugin/tree/master/examples/safeguards-example-service/policies)
as reference to the content of the service object.

### Enabling a custom policy

Once the policy is implemented and saved in the directory, add the `safeguards`
block to the `serverless.yml` file and set the `location` property to reference
the relative path of the policies directory. To enable the policy you must also
add it to the list of policies.

**serverless.yml**
```yaml
custom:
  safeguards:
    location: ./policies
    policies:
      - stage-in-table-name
```

### Adding settings to your policy

Custom policies may also include configuration parameters. The policy function
accepts a third parameter (`options` in the example below) which contains the
settings defined in the `serverless.yml` file.

**./policies/my-custom-policy.js**
```javascript
module.exports = function myCustomPolicy(policy, service, options) {
  // options.max = 2
  policy.approve()
}
```

**serverless.yml**
```yaml
custom:
  safeguards:
    location: ./policies
    policies:
      - my-custom-policy:
          max: 2
```

### Creating a custom remote policy

The custom local policies allow you to define policies as a part of your service’s working directory, but if you need to define a new custom policy across all of your applications and services, then you need to create a custom remote policy. The custom remote policies are defined as a special type of safeguard policy in the Serverless Framework Dashboard and apply to all applications and services in that tenant.

**Create a new javascript safeguard policy in the dashboard**

In the dashboard go to `safeguards` > `+ add`.

On the `add a safeguard policy` page, set the name, description, enforcement level fields and from the `safeguards` dropdown select `javascript`.

Selecting `javascript` as the `safeguard` will enable a IDE-like text area labeled `safeguard configuration`  where you define custom javascript policies.


**Defining the safeguard policy**

In the IDE-like text area, `safeguard configuration`, write the javascript code for the custom safeguard.

The javascript code must return `true` to pass the policy check, or `false` to fail the policy check. If the code doesn’t explicitly `return`, then the response from the last line will be used as the policy check response.

To define the policy method you’ll need to inspect the configuration. The entire
configuration is made available in the service object. Use the [default policies](https://github.com/serverless/enterprise-plugin/tree/master/src/lib/safeguards/policies) as reference to the content of the service object.

**Enabling the custom safeguard policy**

Since this safeguard policy is defined in the dashboard, no further action is needed to enable it for all services. It will be evaluated across all services when running `sls deploy`.

