<!--
title: Serverless Framework - AWS Lambda Guide - Credentials
menuText: Credentials
menuOrder: 3
description: How to set up the Serverless Framework with your Amazon Web Services credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)
<!-- DOCS-SITE-LINK:END -->

# AWS - Credentials

The Serverless Framework needs access to your cloud provider's account so that it can create and manage resources on your behalf.

This guide is for the Amazon Web Services (AWS) provider, so we'll step through the process of setting up credential for AWS and using them with Serverless.

[Watch the video on setting up credentials](https://www.youtube.com/watch?v=HSd9uYj2LJA)

## Amazon Web Services

**[Video Guide Available Here](https://www.youtube.com/watch?v=bFHmgqbAh4M)**

Here's how to set up the Serverless Framework with your Amazon Web Services account.

If you're new to Amazon Web Services, make sure you put in a credit card.

All AWS users get access to the Free Tier for [AWS Lambda](https://aws.amazon.com/lambda/pricing/). AWS Lambda is part of the non-expiring [AWS Free Tier](https://aws.amazon.com/free/#AWS_FREE_TIER).

If you don't have a credit card set up, you may not be able to deploy your resources and you may run into this error:

```
AWS Access Key Id needs a subscription for the service
```

While in the AWS Free Tier, you can build an entire application on AWS Lambda, AWS API Gateway, and more, without getting charged for 1 year...  As long as you don't exceed the resources in the free tier, of course.

### Creating AWS Access Keys

To let the Serverless Framework access your AWS account, we're going to **create an IAM User with Admin access**, which can configure the services in your AWS account.  This IAM User will have its own set of AWS Access Keys.

**Note:** In a production environment, we recommend reducing the permissions to the IAM User which the Framework uses.  Unfortunately, the Framework's functionality is growing so fast, we can't yet offer you a finite set of permissions it needs (we're working on this).  Consider using a separate AWS account in the interim, if you cannot get permission to your organization's primary AWS accounts.

1. Create or login to your Amazon Web Services Account and go to the Identity & Access Management (IAM) page.

2. Click on **Users** and then **Add user**. Enter a name in the first field to remind you this User is the Framework, like `serverless-admin`. Enable **Programmatic access** by clicking the checkbox. Click **Next** to go through to the Permissions page. Click on **Attach existing policies directly**. Search for and select **AdministratorAccess** then click **Next: Review**. Check everything looks good and click **Create user**. Later, you can create different IAM Users for different apps and different stages of those apps.  That is, if you don't use separate AWS accounts for stages/apps, which is most common.

3. View and copy the **API Key** & **Secret** to a temporary place. You'll need it in the next step.

### Using AWS Access Keys

You can configure the Serverless Framework to use your AWS **API Key** & **Secret** in two ways:

#### Quick Setup

As a quick setup to get started you can export them as environment variables so they would be accessible to Serverless and the AWS SDK in your shell:

```bash
export AWS_ACCESS_KEY_ID=<your-key-here>
export AWS_SECRET_ACCESS_KEY=<your-secret-key-here>
# AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are now available for serverless to use
serverless deploy

# 'export' command is valid only for unix shells. In Windows - use 'set' instead of 'export'
```

**Please note:** *If you are using a self-signed certificate you'll need to do one of the following:*
```bash
# String example:
# if using the 'ca' variable, your certificate contents should replace the newline character with '\n'
export ca="-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----"
# or multiple, comma separated
export ca="-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----,-----BEGIN CERTIFICATE-----...-----END CERTIFICATE-----"

# File example:
# if using the 'cafile' variable, your certificate contents should not contain '\n'
export cafile="/path/to/cafile.pem"
# or multiple, comma separated
export cafile="/path/to/cafile1.pem,/path/to/cafile2.pem"


# 'export' command is valid only for unix shells. In Windows - use 'set' instead of 'export'
```


#### Using AWS Profiles

For a more permanent solution you can also set up credentials through AWS profiles. Here are different methods you can use to do so.

##### Setup with `serverless config credentials` command

Serverless provides a convenient way to configure AWS profiles with the help of the `serverless config credentials` command.

Here's an example how you can configure the `default` AWS profile:

```bash
serverless config credentials --provider aws --key AKIAIOSFODNN7EXAMPLE --secret wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

Take a look at the [`config` CLI reference](../cli-reference/config-credentials.md) for more information about credential configuration.

##### Setup with the `aws-cli`

To set them up through the `aws-cli` [install it first](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) then run `aws configure` [to configure the aws-cli and credentials](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html):

```bash
$ aws configure
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-west-2
Default output format [None]: ENTER
```

Credentials are stored in INI format in `~/.aws/credentials`, which you can edit directly if needed. You can change the path to the credentials file via the AWS_SHARED_CREDENTIALS_FILE environment variable. Read more about that file in the [AWS documentation](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-config-files)

You can even set up different profiles for different accounts, which can be used by Serverless as well. To specify a default profile to use, you can add a `profile` setting to your `provider` configuration in `serverless.yml`:

```yml
service: new-service
provider:
  name: aws
  runtime: nodejs6.10
  stage: dev
  profile: devProfile
```

##### Use an existing AWS Profile

To easily switch between projects without the need to do `aws configure` every time you can use environment variables.
For example you define different profiles in `~/.aws/credentials`

```ini
[profileName1]
aws_access_key_id=***************
aws_secret_access_key=***************

[profileName2]
aws_access_key_id=***************
aws_secret_access_key=***************
```

Now you can switch per project (/ API) by executing once when you start your project:

`export AWS_PROFILE="profileName2" && export AWS_REGION=eu-west-1`.

in the Terminal. Now everything is set to execute all the `serverless` CLI options like `sls deploy`.
The AWS region setting is to prevent issues with specific services, so adapt if you need another default region.

##### Using the `aws-profile` option

You can always specify the profile which should be used via the `aws-profile` option like this:

```bash
serverless deploy --aws-profile devProfile
```

#### Per Stage Profiles

As an advanced use-case, you can deploy different stages to different accounts by using different profiles per stage. In order to use different profiles per stage, you must leverage [variables](https://serverless.com/framework/docs/providers/aws/guide/variables) and the provider profile setting.

This example `serverless.yml` snippet will load the profile depending upon the stage specified in the command line options (or default to 'dev' if unspecified);

```yml
service: new-service
provider:
  name: aws
  runtime: nodejs6.10
  stage: ${opt:stage, self:custom.defaultStage}
  profile: ${self:custom.profiles.${self:provider.stage}}
custom:
  defaultStage: dev
  profiles:
    dev: devProfile
    prod: prodProfile
```

#### Profile in place with the 'invoke local' command

**Be aware!** Due to the way AWS IAM and the local environment works, if you invoke your lambda functions locally using the CLI command `serverless invoke local -f ...` the IAM role/profile could be (and probably is) different from the one set in the `serverless.yml` configuration file.
Thus, most likely, a different set of permissions will be in place, altering the interaction between your lambda functions and other AWS resources.

*Please, refer to the `invoke local` CLI command documentation for more details.*
