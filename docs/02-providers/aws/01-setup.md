<!--
title: AWS Authentication Setup
menuText: AWS Authentication Setup
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

1. Create or login to your Amazon Web Services Account and go to the Identity & Access Management (IAM) Page
2. Click on **Users** and then **Create New Users**. Enter `serverless-admin` in the first field and click **Create**
3. **View and copy the API Key & Secret. You'll need it in the next step**
4. In the User record in the AWS IAM Dashboard, look for **Managed Policies** on the **Permissions** tab and click
**Attach Policy**
5. In the next screen, search for and select **AdministratorAccess** then click **Attach**

### Signing up for an AWS Subscription

Most AWS services require you to have a credit card set up, otherwise you can't deploy your resources and the following error message will appear:

>AWS Access Key Id needs a subscription for the service

If you created a new AWS account make sure that a credit card is set up for the account.

### Setting the AWS API Key & Secret

To start using Serverless and access the AWS API you need to set the AWS API Access Key & Secret.

#### Quick Setup

As a quick setup to get started you can export them as environment variables so they would be accessible to Serverless and the AWS SDK in your shell:

```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
```

OR, if you already have an AWS profile set up...

```bash
export AWS_PROFILE=<profile>
```

Continue with [creating your first service](https://github.com/serverless/serverless/blob/master/docs/01-guide/02-creating-services.md).

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

You can even set up different profiles for different accounts, which can be used by Serverless as well.

#### Specifying Credentials/Profiles to Serverless

You can specify either credentials or a profile.  Each of these can be provided by altering your serverless.yml or your system's environment variables.  Each can be specified for all stages or you can specify stage specific credentials.  Using variables in your serverless.yml, you could implement more complex credential selection capabilities.


One set of credentials for all stages using serverless.yml
```yml
provider:
  credentials:
    accessKeyId: YOUR_ACCESS_KEY
    secretAccessKey: YOUR_SECRET_KEY
```

A set of credentials for each stage using serverless.yml
```yml
vars:
  test:
    credentials:
      accessKeyId: YOUR_ACCESS_KEY_FOR_TEST
      secretAccessKey: YOUR_SECRET_KEY_FOR_TEST
  prod:
    credentials:
      accessKeyId: YOUR_ACCESS_KEY_FOR_PROD
      secretAccessKey: YOUR_SECRET_KEY_FOR_PROD
provider:
  credentials: ${self:vars.{opt:stage}.credentials}
```

One profile for all stages using serverless.yml
```yml
provider:
  profile: your-profile
```

A profile for each stage using serverless.yml
```yml
vars:
  test:
    profile: your-profile-for-test
  prod:
    profile: your-profile-for-prod
provider:
  profile: ${self:vars.{opt:stage}.profile}
```

One set of credentials for all stages using environment variables
```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
export AWS_SESSION_TOKEN=<token>
serverless <...>
```

A set of credentials for each stage using environment variables
```bash
export AWS_TEST_ACCESS_KEY_ID=<key>
export AWS_TEST_SECRET_ACCESS_KEY=<secret>
export AWS_TEST_SESSION_TOKEN=<token>

export AWS_PROD_ACCESS_KEY_ID=<key>
export AWS_PROD_SECRET_ACCESS_KEY=<secret>
export AWS_PROD_SESSION_TOKEN=<token>

serverless <...>
```

A profile for all stages using environment variables
```bash
export AWS_PROFILE=<profile>
serverless <...>
```

A profile for each stage using environment variables
```bash
export AWS_TEST_PROFILE=<profile>

export AWS_PROD_PROFILE=<profile>

serverless <...>
```

#### Credential & Profile Overriding

Sometimes you want to be able to specify a default but to override that default for a special case.  This is possible with credentials and profiles in Serverless.  You may specify credentials and profiles in various forms.  The serverless.yml has the lowest priority and environment variables used for all stages will override values set in serverless.yml.  Environment variables that are specific to a stage have the highest priority and will override both broad environment variables as well as serverless.yml.  Profile provided credentials will override credentials provided in piece-meal from otherwise equivalent credential sources.  A priority listing follows.

severless.yml credentials < serverless.yml profile credentials < all-stages environment credentials < all stages environment profile credentials < stage-specific environment credentials < stage-specific environment profile credentials

A default set of `prod` credentials to use overriden by stage specific credentials
```bash
export AWS_ACCESS_KEY_ID=<key>
export AWS_SECRET_ACCESS_KEY=<secret>
export AWS_SESSION_TOKEN=<token>

export AWS_PROD_ACCESS_KEY_ID=<prod-key>
export AWS_PROD_SECRET_ACCESS_KEY=<prod-secret>
export AWS_PROD_SESSION_TOKEN=<prod-token>

serverless <...>
```

A default profile to use overriden by a `prod` specific profile
```bash
export AWS_PROFILE=<profile>

export AWS_PROD_PROFILE=<profile>

serverless <...>
```

A default profile declared in serverless.yml overridden by a `prod` specific environment variable profile
```yml
provider:
  profile: your-profile
```
```bash
export AWS_PROD_ACCESS_KEY_ID=<prod-key>
export AWS_PROD_SECRET_ACCESS_KEY=<prod-secret>
export AWS_PROD_SESSION_TOKEN=<prod-token>

serverless <...>
```

Et cetera

## Conclusion

With the account setup in place Serverless is now able to create and manage resources on our behalf.
Now it's time to start with our first Serverless service.

[Next step > Creating a service](../../01-guide/02-creating-services.md)
