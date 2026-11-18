<!--
title: AWS Credentials
description: 'Connect the Serverless Framework to your AWS account: serverless login aws, SSO, profiles, environment variables, resolvers and Dashboard providers.'
short_title: AWS Credentials
keywords:
  [
    'Serverless Framework',
    'AWS credentials',
    'serverless login aws',
    'AWS profile',
    'AWS SSO',
    'credential resolvers',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# AWS Credentials

The Serverless Framework creates and manages resources in your AWS account, so every command that talks to AWS needs AWS credentials. This page shows the ways to provide them (browser sign-in, AWS IAM Identity Center (SSO), profiles, environment variables, credential resolvers in `serverless.yml`, and Serverless Dashboard providers) and which one a deploy uses when several are available.

On your own machine, sign in through the AWS Console in a browser and deploy:

```bash
serverless login aws
serverless deploy
```

`serverless login aws` stores short-lived credentials in the `default` AWS profile. In CI/CD, where nothing can open a browser, use environment variables or a role instead (see [Running in your own CI/CD](../../../guides/dashboard/cicd/running-in-your-own-cicd.md)).

## Which credentials a deploy uses

A deploy takes its AWS credentials from the first of these that applies:

1. The `aws` resolver named by `provider.resolver`, or, when `provider.profile` is not set, the service's only `type: aws` resolver, with a stage's block overriding a same-named one in `stages.default` (see [Using resolvers to specify deployment credentials](#using-resolvers-to-specify-deployment-credentials)).
2. `--aws-profile` on the command line.
3. `provider.profile` in `serverless.yml`.
4. The standard AWS credential provider chain: `AWS_PROFILE`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, then the shared config files.

If the service sets `org` and `app` and a [Serverless Dashboard Provider](../../../guides/dashboard/providers.md) applies to it, the Provider's credentials are used ahead of all of these, unless the resolver from step 1 sets `dashboard: false`.

When a resolver supplies the credentials, `--aws-profile` is ignored. Run `serverless agent setup --stage <stage>` to see which source a deploy to that stage would use, and whether AWS accepts it.

## Sign in with the AWS Console

`serverless login aws` signs you in through the AWS Console in a browser and creates short-lived credentials, without long-term access keys:

1. Run the command in an interactive terminal:

   ```bash
   serverless login aws
   ```

2. Complete the sign-in in the browser that opens. The CLI saves the session token under `~/.aws/login/cache/` and points the `default` profile in `~/.aws/config` (or the file in `AWS_CONFIG_FILE`) at it. To use another profile, add `--aws-profile <name>` (see [`login aws`](../cli-reference/login-aws.md)).

3. Deploy:

   ```bash
   serverless deploy
   ```

The command needs an interactive terminal: in CI or other non-interactive environments, it stops with an error.

AWS keeps the session valid for up to 12 hours. After it ends, commands stop with an error that starts with `AWS credentials missing or invalid` and ends with:

```text
Original error from AWS: Your session has expired. Please reauthenticate.
```

Run `serverless login aws` again to start a new session.

## Use the AWS credential provider chain

Without a resolver or profile setting, the Framework reads credentials through the [AWS credential provider chain](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html#credentialProviderChain), the same sources the AWS CLI and SDKs use:

- **Environment variables:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and, for temporary credentials, `AWS_SESSION_TOKEN`.
- **AWS IAM Identity Center (SSO):** configure a profile with `aws configure sso`, then sign in (and sign in again when the session expires) with [`serverless login aws sso`](../cli-reference/login-aws-sso.md) or `aws sso login`.
- **Profiles:** named profiles in `~/.aws/credentials` and `~/.aws/config`. Choose one with `--aws-profile`, `provider.profile` in `serverless.yml`, or the `AWS_PROFILE` environment variable.
- **Instance roles:** on an EC2 instance or in a container with an IAM role, the role's credentials.

If an MFA device protects a profile's role, the CLI prompts for the code.

The AWS SDK's own SSO and STS clients use the same proxy settings as the Framework's AWS requests: set `HTTPS_PROXY` (or `HTTP_PROXY` as a fallback; lowercase names work too) when these requests must go through a proxy, and `NO_PROXY=.amazonaws.com` to bypass it for AWS endpoints.

## Save access keys in a local profile

When `serverless` runs onboarding and finds no valid AWS credentials, it offers to set them up. Choose **Save AWS Credentials in a Local Profile** to store long-term access keys:

1. Run `serverless` in your terminal.
2. Choose **Save AWS Credentials in a Local Profile**.
3. Follow the printed instructions: in the AWS IAM console, create an IAM user with the policy the instructions name (they suggest `AdministratorAccess`; attach a narrower policy if your organization requires one), then create an access key for it.
4. Enter the Access Key ID and Secret Access Key when prompted.

The CLI writes the keys to the `default` profile in `~/.aws/credentials`, replacing the keys already in that profile. Later commands read them through the credential provider chain.

To configure credentials another way (SSO, environment variables), choose **Skip & Set Later (AWS SSO, ENV Vars)** instead.

## Using resolvers to specify deployment credentials

A [resolver](../../../guides/variables/README.md) of `type: aws` in `serverless.yml` describes an AWS account: a profile or access keys, and a Region. One resolver can supply the deployment credentials, and every resolver can also read variables from its account.

### Defining resolvers

Declare resolvers under `stages.<stage>.resolvers`; a resolver under `stages.default` applies to every stage that doesn't declare one with the same name:

```yaml
stages:
  default:
    resolvers:
      aws-account-1:
        type: aws
        profile: account1-profile-name
        region: us-west-2
```

With this as the service's only `type: aws` resolver, deploys use the `account1-profile-name` profile. For all options, see the [AWS resolver](../../../guides/variables/aws/README.md) documentation.

### Using multiple resolvers

With more than one `type: aws` resolver, for example one account for shared variables and another for the deployment, set `provider.resolver` to the resolver that supplies the deployment credentials:

```yaml
service: my-service

stages:
  default:
    resolvers:
      shared-account:
        type: aws
        region: us-east-1
        accessKeyId: ${env:SHARED_ACCOUNT_AWS_ACCESS_KEY_ID}
        secretAccessKey: ${env:SHARED_ACCOUNT_AWS_SECRET_ACCESS_KEY}
      project-specific-account:
        type: aws
        region: us-west-2
        profile: project-specific-profile

provider:
  name: aws
  resolver: project-specific-account

functions:
  hello:
    handler: handler.hello
    environment:
      ACCOUNT_ID: ${project-specific-account:accountId}
      SHARED_VAR: ${shared-account:ssm:/path/to/param}
```

`project-specific-account` supplies the deployment credentials, and both resolvers supply variables from their accounts.

### Resolver and profile rules

- `provider.profile` and `provider.resolver` can't be set together: the command stops with `The provider.profile and provider.resolver cannot be set at the same time`.
- With neither set and a single `type: aws` resolver (a name in both `stages.default` and the current stage counts once), that resolver supplies the deployment credentials.
- With `provider.profile` set, `provider.profile` wins over a single `type: aws` resolver.
- With several `type: aws` resolvers and no `provider.profile`, `provider.resolver` is required; otherwise the command stops with `Multiple resolvers with type "aws" found. Please specify the credential provider to use for deployment in the provider.resolver key.`

### Overriding a resolver's profile

To let one person or one run use another profile without editing the resolver, give its `profile` a variable with the team's default. A parameter keeps the default next to the stage and takes a one-off override on the command line:

```yaml
stages:
  staging:
    params:
      awsProfile: staging-account
    resolvers:
      aws-account:
        type: aws
        profile: ${param:awsProfile}
```

```bash
serverless deploy --stage staging --param "awsProfile=my-staging"
```

For an override that stays on one machine, use an environment variable instead: `profile: ${env:STAGING_AWS_PROFILE, 'staging-account'}`.

### Using Serverless Dashboard Providers with resolvers

When the service sets `org` and `app` and a Dashboard Provider applies to it, every `type: aws` resolver uses the Provider's credentials. To use the resolver's own profile or keys instead, set `dashboard: false` on it:

```yaml
service: my-service
org: my-org
app: my-app

stages:
  default:
    resolvers:
      local-profile-account:
        type: aws
        dashboard: false
        region: us-west-2
        profile: project-specific-profile
      dashboard-provider-account:
        type: aws

provider:
  name: aws
  resolver: local-profile-account
```

Here `local-profile-account` supplies the deployment credentials from the local profile `project-specific-profile`, and `dashboard-provider-account` resolves variables with the Provider's credentials.

## Use a Serverless Dashboard Provider

A [Serverless Dashboard Provider](../../../guides/dashboard/providers.md) stores the connection to an AWS account (an IAM role the Dashboard assumes) in your Dashboard org, so no AWS credentials live on your machine or in CI. A Provider applies only to services that set `org` and `app` in `serverless.yml`. To add one to an existing service, see the Provider documentation.

To create a new service connected through a Provider:

1. In an empty directory, run `serverless`.
2. Choose a template, for example **AWS / Node.js / HTTP API**.
3. Enter a service name. The CLI creates a directory with that name and adds the template's files.
4. Choose **Login/Register** and sign in to the Serverless Dashboard in the browser, or create an account (you can create an org with the right name later). Return to the terminal.
5. Create an App or select one. Don't skip this step: the Provider is used only with `org` and `app` set.
6. When asked about AWS credentials, choose **Create AWS IAM Role (Easy & Recommended)**.
7. Open the CloudFormation link the terminal prints, signed in to the AWS account you want to use. Keep the defaults, tick the box acknowledging that AWS CloudFormation might create IAM resources, and choose **Create stack**.
8. When the stack is created, the terminal detects the new Provider. Follow the next steps it prints, then run `serverless deploy` in the new directory.

If your machine already has AWS credentials, or your org already has a default Provider, onboarding skips the AWS credentials question. A Provider linked to the service (or the org's default Provider) is still used ahead of your local credentials when `serverless.yml` sets `org` and `app` and you are logged in with `serverless login`.

## Set up AWS accounts for production

For production applications, use several AWS accounts managed with AWS Organizations: a management account that holds no workloads, separate accounts for production and development, and optionally one account per developer. Each Serverless Framework stage then deploys to its own account.

### Management account

The management account only manages the other accounts and their users:

1. Sign in to the new account, usually created with an alias email address for your team, and open the **Organizations** service.
   ![AWS Organizations console before an organization is created](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/create-an-organization-pre.png)
2. Choose **Create an organization**. The account you are signed in to is listed as the management account.
   ![AWS Organizations console listing the management account after the organization is created](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/create-an-organization-post.png)
3. Open **IAM Identity Center** and choose **Enable**.
   ![IAM Identity Center console with the Enable button](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-enable-pre.png)
   IAM Identity Center gives your users an AWS access portal URL, which you can customize later.
   ![IAM Identity Center settings showing the AWS access portal URL](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-url.png)
4. Under **Users**, choose **Add user** and enter your own email address and details.
   ![IAM Identity Center Add user form with the user details](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-add-user-details.png)
5. Skip adding the user to groups: choose **Next**, review, and choose **Add user**.
6. Under **AWS accounts**, select the management account.
   ![IAM Identity Center navigation menu with AWS accounts selected](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-menu.png)
7. Choose **Assign users or groups**.
   ![AWS accounts list in IAM Identity Center with the Assign users or groups button](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/iam-identity-center-assign-users-or-groups.png)
8. On the **Users** tab, select the new user and choose **Next**.
   ![Users tab with the new user selected for assignment to the account](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/organizations-assign-users-and-groups-to-account.png)
9. Choose **Create permission set**, which opens a new tab.
   ![Assign permission sets step with the Create permission set button](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/assign-permission-sets.png)
10. Choose a predefined permission set. `AdministratorAccess` gets you started; replace it with a narrower set when your team's needs are clear.
    ![Create permission set page with the predefined permission set selected](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/pre-defined-permission-set.png)
11. Choose any session duration (it limits how long a signed-in user's session lasts and doesn't affect Dashboard Providers), choose **Next**, then **Create**.
    ![Permission set details page with the session duration setting](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/permission-set-review.png)
12. Close the tab and return to the assignment. Refresh if the new permission set isn't listed, select it, choose **Next**, then **Submit**.
    ![Account assignment review with the user and its permission set](https://s3.us-east-2.amazonaws.com/assets.public.serverless/website/framework/docs/aws-credentials/user-assigned-to-account.png)

The new user receives an email to activate the account. Add further users the same way.

### Stage accounts for production and development

Separate accounts keep experimental changes out of the account that serves your customers:

1. In **Organizations**, choose **Add an AWS account**.
2. Give the account a name that marks it as the development account.
3. Use an alias email address: users of the management account get access to the new account through IAM Identity Center.
4. Choose **Create AWS account**.
5. Repeat for the production account.

### Developer accounts

Shared development accounts can still lead developers to overwrite each other's stacks. Create one account per developer the same way, which isolates their deployments and is managed through Organizations as people join and leave the team.

### Combine accounts with Dashboard Providers

With the accounts in place, create a [Dashboard Provider](../../../guides/dashboard/providers.md) for each account and link it to the stages that deploy there.

## Related pages

- [Dashboard Providers](../../../guides/dashboard/providers.md): AWS access through the Serverless Dashboard.
- [AWS resolver](../../../guides/variables/aws/README.md): every option of `type: aws` resolvers.
- [`serverless login aws`](../cli-reference/login-aws.md) and [`serverless login aws sso`](../cli-reference/login-aws-sso.md): the sign-in commands.
- [Running in your own CI/CD](../../../guides/dashboard/cicd/running-in-your-own-cicd.md): credentials in a pipeline.
