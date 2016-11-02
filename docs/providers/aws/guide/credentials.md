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

# Credentials

The Serverless Framework needs access to your cloud providers account so that it can create and manage resources on your behalf.

Here we'll provide setup instructions for different cloud provider accounts. Just pick the one for your provider and follow the steps to get everything in place for Serverless.

At this time, the Serverless Framework supports only Amazon Web Services, but support for other providers is in the works.

## Amazon Web Services

**[Video Guide Available Here](https://www.youtube.com/watch?v=bFHmgqbAh4M)**

Here's how to set up the Serverless Framework with your Amazon Web Services account.

If you're new to Amazon Web Services, make sure you put in a credit card.  If you don't have a credit card set up, you may not be able to deploy your resources and you may run into this error:

```bash
AWS Access Key Id needs a subscription for the service
```

Don't worry, you won't be charged for signing up.  New AWS users get access to the [AWS Free Tier](https://aws.amazon.com/free/), which let's you use many AWS resources for free for 1 year, like [AWS Lambda](https://aws.amazon.com/lambda/pricing/).

While in the AWS Free Tier, you can build an entire application on AWS Lambda, AWS API Gateway, and more, without getting charged for 1 year...  As long as you don't exceed the resources in the Free Tier.

### Creating AWS Access Keys

To let the Serverless Framework access your AWS account, we're going to create an IAM User with Admin access, which can configure the services in your AWS account.  This IAM User will have its own set of AWS Access Keys.

**Note:** In a production environment, we recommend reducing the permissions to the IAM User which the Framework uses.  Unfortunately, the Framework's functionality is growing so fast, we can't yet offer you a finite set of permissions it needs (we're working on this).  Consider using a separate AWS account in the interim, if you cannot get permission to your organization's primary AWS accounts.

1. Create or login to your Amazon Web Services Account and go to the Identity & Access Management (IAM) page.

2. Click on **Users** and then **Create New Users**. Enter a name in the first field to remind you this User is the Framework, like `serverless-admin`.  Then click **Create**.  Later, you can create different IAM Users for different apps and different stages of those apps.  That is, if you don't use separate AWS accounts for stages/apps, which is most common.

3. View and copy the **API Key** & **Secret** to a temporary place. You'll need it in the next step.

4. In the User record in the AWS IAM Dashboard, look for **Managed Policies** on the **Permissions** tab and click **Attach Policy**.

5. In the next screen, search for and select **AdministratorAccess** then click **Attach**.

### Using AWS Access Keys

You can configure the Serverless Framework to use your AWS **API Key** & **Secret** two ways:

#### Quick Setup

As a quick setup to get started you can export them as environment variables so they would be accessible to Serverless and the AWS SDK in your shell:

```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
serverless deploy
```

#### Using AWS Profiles

For a more permanent solution you can also set up credentials through AWS profiles using the `aws-cli`, or by configuring the credentials file directly.

To set them up through the `aws-cli` [install it first](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) then run `aws configure` [to configure the aws-cli and credentials](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html):

```bash
$ aws configure
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Default region name [None]: us-west-2
Default output format [None]: ENTER
```

Credentials are stored in INI format in `~/.aws/credentials`, which you can edit directly if needed. Read more about that file in the [AWS documentation](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#cli-config-files)

You can even set up different profiles for different accounts, which can be used by Serverless as well. To specify a default profile to use, you can add a `profile` setting to your `provider` configuration in `serverless.yml`:

```yml
service: new-service
provider:
  name: aws
  runtime: nodejs4.3
  stage: dev
  profile: devProfile
```

##### Per Stage Profiles

As an advanced use-case, you can deploy different stages to different accounts by using different profiles per stage. In order to use different profiles per stage, you must leverage [variables](https://serverless.com/framework/docs/providers/aws/guide/variables) and the provider profile setting.

This example `serverless.yml` snippet will load the profile depending upon the stage specified in the command line options (or default to 'dev' if unspecified);

```yml
service: new-service
provider:
  name: aws
  runtime: nodejs4.3
  stage: ${opt:stage, self:custom.defaultStage}
  profile: ${self:custom.profiles.${self:provider.stage}}
custom:
  defaultStage: dev
  profiles:
    dev: devProfile
    prod: prodProfile
```
