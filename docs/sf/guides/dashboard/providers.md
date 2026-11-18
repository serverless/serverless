<!--
title: Dashboard Providers
description: Store AWS credentials as Providers in the Serverless Framework Dashboard and link them to services and stages, so commands deploy with them.
short_title: Providers
keywords:
  [
    'Serverless Framework',
    'Dashboard',
    'Providers',
    'AWS credentials',
    'IAM role',
    'AWS account per stage',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/providers)

<!-- DOCS-SITE-LINK:END -->

# Dashboard Providers

A Provider stores access to an AWS account in the Serverless Framework Dashboard, usually as an IAM role that the Dashboard assumes. When a service is linked to a Provider, the Serverless Framework CLI gets short-lived AWS credentials from the Dashboard for each command, instead of reading credentials on your machine. Use Providers to deploy each stage to its own AWS account, to keep long-lived AWS keys off developer machines and CI/CD, and to share account access across a team without passing credentials around.

To deploy with a Provider, link it to the service in the Dashboard (or make it the organization's default), then set `org`, `app` and `service` in `serverless.yml`:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  region: us-east-1
```

Sign in and deploy; the CLI uses the Provider's credentials:

```bash
serverless login
serverless deploy
```

## Add a provider to your organization

To add a provider, go to the **Org Settings** section of the [Dashboard](https://app.serverless.com), open the **Providers** tab, click **Add** and follow the instructions. To control the role's permissions yourself, see [Use a custom IAM role and policy](#use-a-custom-iam-role-and-policy).

You can also create a provider from the CLI. When you run `serverless` (the onboarding command) signed in with a Dashboard account, no AWS credentials are found on your machine and your organization has no default provider, choose **Create AWS IAM Role (Easy & Recommended)**. The CLI prints a link to a pre-filled AWS CloudFormation quick-create page: open it while signed in to the AWS account you want to deploy to, acknowledge that the stack creates IAM resources, and create the stack. The stack creates the IAM role, and the CLI waits until the provider appears in your organization.

To keep production apart from other environments, deploy each stage to its own AWS account: for example, add a `dev` provider and a `prod` provider.

### Set a default organization provider

The organization's default provider applies to every service and instance that has no provider of its own, when the service meets the conditions in [Use providers in serverless.yml](#use-providers-in-serverlessyml). To set it, go to the **orgs** section of the Dashboard, open the **providers** tab, and in the provider's **...** menu select **set as default**.

## Link a provider to a service or an instance

A provider in your organization applies to a service only when you link it, or when it is the organization default.

- **Service:** go to the **apps** section of the Dashboard, open the **...** menu of the service, select **settings**, open the **providers** tab and click **add provider**. The provider applies to every stage and region of the service.
- **Instance:** an instance is one stage and region of a service. Open the instance's details page, go to the **providers** tab and add a provider from the **add providers** dropdown. Link providers to instances when stages or regions deploy to different AWS accounts.

## Which provider a command uses

For each command, the CLI asks the Dashboard for the provider of the service instance, identified by the app, the service, the stage and the region:

- The stage is `--stage`, else `provider.stage`, else `dev`.
- The region is `--region`, else `provider.region`, else `us-east-1`. `AWS_REGION` and an `aws` resolver's `region` can set the region a deploy goes to but not this lookup, so set `provider.region` or pass `--region` when you link providers to instances.

The Dashboard returns the first provider it finds in this order:

1. The provider linked to the instance.
2. The provider linked to the service.
3. The organization's default provider.

An instance's provider replaces the service's. A new stage has no instance provider until you link one, so it uses the service's provider, else the organization default.

### Deploy each stage to its own account

To deploy `dev` and other stages to one account and `prod` to another, link a `dev` provider to the service and a `prod` provider to the instances of the `prod` stage. A new stage such as `int` then deploys with the `dev` provider.

### Deploy CI/CD previews to a preview account

CI/CD services often deploy each pull request to its own stage, such as `feature-x`. To keep those previews out of production, create a `preview` provider and a `prod` provider for two accounts. Link `preview` to the service and `prod` to the instances of the `prod` stage. Preview stages then deploy with `preview`, and deploys to `prod` use the `prod` provider.

## Use providers in serverless.yml

A provider applies to a command when all of these are true:

- `org`, `app` and `service` are set in `serverless.yml`. In a Compose project, the org of the Compose run can stand in for `org`.
- The CLI is signed in with `serverless login`, or uses an Access Key (`SERVERLESS_ACCESS_KEY`) in CI/CD. Dashboard features, including providers, aren't available with a [License Key](../license-keys.md).
- The Dashboard has a provider for the instance, the service or the organization.

When a provider applies, its credentials take precedence over credentials on your machine, including `provider.profile`, `AWS_PROFILE` and keys set on an `aws` resolver. To use other credentials anyway, set `dashboard: false` on the `aws` resolver that provides deployment credentials; see [Using Serverless Dashboard Providers with Resolvers](../../providers/aws/guide/credentials.md#using-serverless-dashboard-providers-with-resolvers).

When no provider applies, the CLI uses the AWS credentials on your machine; see [AWS Credentials](../../providers/aws/guide/credentials.md).

For an IAM role provider, the Dashboard assumes the role for each command and returns temporary credentials that expire after 30 minutes.

## Use a custom IAM role and policy

The CloudFormation template that the Dashboard and the CLI offer creates the IAM role for you. To control the role's permissions yourself, create the role in your AWS account and add it to the Dashboard as a provider.

Give the role this trust policy, so the Dashboard can assume it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::DASHBOARD_ACCOUNT_ID:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "ServerlessFramework-ORG_ID"
        }
      }
    }
  ]
}
```

The principal is the Serverless, Inc. AWS account that assumes the role. Replace `DASHBOARD_ACCOUNT_ID` with the account in the `Principal` of the trust policy in the CloudFormation template the Dashboard provides when you add an AWS IAM Role provider. Replace `ORG_ID` with the **Org ID** shown in the Dashboard under **Org Settings** > **General**. The Dashboard passes `ServerlessFramework-<your Org ID>` as the external ID whenever it assumes the role, so the `sts:ExternalId` condition lets it assume the role only on behalf of your organization.

The role needs the permissions to deploy your services. The Framework creates an IAM role for your functions during deploys, so the policy includes `iam:CreateRole` and `iam:PassRole`. A narrower policy is yours to maintain as your services add AWS resources.

This sample policy deploys a basic Node.js function and covers the Dashboard's features. It includes the SSM and S3 actions for the region's shared [deployment bucket](../deployment-bucket.md): `ssm:GetParameter` and `s3:CreateBucket` on every deploy, `ssm:PutParameter` and `s3:PutBucketVersioning` when the Framework creates the bucket, and `s3:GetBucketVersioning` while it waits for a bucket another deploy is creating.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "logs:DeleteSubscriptionFilter",
        "s3:CreateBucket",
        "iam:CreateRole",
        "lambda:GetFunctionConfiguration",
        "cloudformation:DescribeStackResource",
        "iam:PutRolePolicy",
        "s3:GetObject*",
        "cloudformation:DescribeStackEvents",
        "s3:DeleteBucketWebsite",
        "logs:GetLogEvents",
        "cloudformation:UpdateStack",
        "lambda:ListLayerVersions",
        "lambda:ListLayers",
        "lambda:DeleteFunction",
        "events:RemoveTargets",
        "logs:FilterLogEvents",
        "lambda:GetAlias",
        "s3:DeleteObject",
        "s3:ListBucket",
        "apigateway:GET",
        "cloudformation:ListStackResources",
        "iam:GetRole",
        "events:DescribeRule",
        "lambda:ListFunctions",
        "lambda:InvokeFunction",
        "lambda:GetEventSourceMapping",
        "lambda:ListAliases",
        "iam:DeleteRole",
        "iam:UpdateAssumeRolePolicy",
        "s3:DeleteBucketPolicy",
        "logs:CreateLogGroup",
        "logs:TagResource",
        "cloudformation:DescribeStacks",
        "lambda:UpdateFunctionCode",
        "s3:PutObject",
        "cloudformation:DeleteStack",
        "lambda:ListEventSourceMappings",
        "lambda:PublishVersion",
        "logs:PutSubscriptionFilter",
        "apigateway:POST",
        "cloudformation:ValidateTemplate",
        "lambda:ListVersionsByFunction",
        "lambda:GetLayerVersion",
        "s3:DeleteObjectVersion",
        "events:PutRule",
        "lambda:GetAccountSettings",
        "lambda:GetLayerVersionPolicy",
        "s3:PutEncryptionConfiguration",
        "apigateway:DELETE",
        "iam:PassRole",
        "lambda:ListTags",
        "iam:DeleteRolePolicy",
        "apigateway:PATCH",
        "s3:DeleteBucket",
        "logs:DescribeLogGroups",
        "logs:DeleteLogGroup",
        "apigateway:PUT",
        "lambda:GetFunction",
        "lambda:UpdateFunctionConfiguration",
        "events:PutTargets",
        "events:CreateSubscriber",
        "events:UpdateSubscriber",
        "events:DeleteSubscriber",
        "events:DescribeSubscriber",
        "events:ListSubscribers",
        "events:ListTagsForResource",
        "events:TagResource",
        "events:UntagResource",
        "lambda:AddPermission",
        "cloudformation:CreateStack",
        "s3:PutBucketPolicy",
        "sts:GetCallerIdentity",
        "lambda:RemovePermission",
        "s3:GetBucketLocation",
        "lambda:GetPolicy",
        "ssm:GetParameter",
        "ssm:PutParameter",
        "s3:PutBucketVersioning",
        "s3:GetBucketVersioning"
      ],
      "Resource": "*"
    }
  ]
}
```

### Scope `iam:PassRole` for EventBridge

The sample's `events:` subscriber actions deploy `eventBridge` events on a custom event bus. Their subscribers deliver through a role the Framework generates, `<service>-<stage>-<region>-eventBridge`, which the deploying identity passes to EventBridge. If you scope `iam:PassRole` rather than allowing it on every resource, allow it on that role for EventBridge only, and keep a separate statement for the functions' execution roles:

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::123456789012:role/*-eventBridge",
  "Condition": {
    "StringEquals": { "iam:PassedToService": "events.amazonaws.com" }
  }
}
```

Replace `123456789012` with your AWS account ID. See [Deploy permissions](../../providers/aws/events/event-bridge.md#deploy-permissions) and [The delivery role](../../providers/aws/events/event-bridge.md#the-delivery-role).

## Related

- [AWS Credentials](../../providers/aws/guide/credentials.md): every way to give the Framework AWS credentials.
- [Parameters](../parameters.md): Dashboard parameters, looked up for the same instance.
- [CI/CD](./cicd/README.md): deploy from the Dashboard's CI/CD with providers.
