<!--
title: AWS Authentication Setup
layout: Doc
-->

# Provider account setup

[Watch the video guide here](https://youtu.be/weOsx5rLWX0)

Serverless needs access to your cloud providers account so that it can create and manage resources on your behalf.

Here we'll provide setup instructions for different cloud provider accounts. Just pick the one for your
provider and follow the steps to get everything in place for Serverless.

## Amazon Web Services

### Creating an administrative IAM User

We're going to create an admin user which can access and configure the services in your AWS account.
To get you up and running quickly, we're going to create a AWS IAM User with administrative access to your AWS account.

**Note:** In a production environment we recommend reducing the permissions to the IAM User which the Framework uses.

Unfortunately, the frameworks functionality is growing so fast, we can't yet offer you a finite set of permissions it needs. In the interim, ensure that your AWS API Keys are kept in a safe, private location.

1. Create or login to your Amazon Web Services Account and go the the Identity & Access Management (IAM) Page
2. Click on **Users** and then **Create New Users**. Enter `serverless-admin` in the first field and click **Create**
3. **View and copy the API Key & Secret. You'll need it in the next step**
4. In the User record in the AWS IAM Dashboard, look for **Managed Policies** on the **Permissions** tab and click
**Attach Policy**
5. In the next screen, search for and select **AdministratorAccess** then click **Attach**

### Signing up for an AWS Subscription

Most AWS services require you to have a credit card set up, otherwise you can't deploy your resources and the following error message will appear:

`AWS Access Key Id needs a subscription for the service`

If you created a new AWS account make sure that a credit card is set up for the account.

### Setting the AWS API Key & Secret

To start using Serverless and access the AWS API you need to set the AWS API Access Key & Secret.

#### Quick Setup

As a quick setup to get started you can export them as environment variables so they would be accessible to Serverless and the AWS SDK in your shell:

```
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
serverless deploy
```

#### Using AWS Profiles

For a more permanent solution you can also set up credentials through AWS profiles using the `aws-cli`, or by configuring the credentials file directly.

To set them up through the `aws-cli` [install it first](http://docs.aws.amazon.com/cli/latest/userguide/installing.html) then run `aws configure` [to configure the aws-cli and credentials](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html):

```
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

As an advanced use-case, you can deploy different stages to different accounts by using different profiles per stage. In order to use different profiles per stage, you must leverage [variables](../01-guide/08-serverless-variables.md) and the provider profile setting.

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

## Conclusion

With the account setup in place Serverless is now able to create and manage resources on our behalf.
Now it's time to start with our first Serverless service.

[Next step > Creating a service](creating-a-service.md)
