<!--
title: Axiom Observability
description: Send a stage's Lambda function and CloudWatch logs to Axiom with observability set to axiom in serverless.yml and an AXIOM_TOKEN API token.
short_title: Axiom
keywords: ['Serverless Framework', 'Observability', 'Axiom', 'Axiom Lambda extension', 'CloudWatch logs to Axiom']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/observability/axiom)

<!-- DOCS-SITE-LINK:END -->

# Axiom observability

The `axiom` observability provider sends the logs of a service's Lambda functions, and of the other CloudWatch Logs log groups the service defines, to an [Axiom](https://slss.io/axiom) dataset. The Framework adds the Axiom Lambda extension to each function and deploys Axiom's CloudWatch forwarder for the other log groups, so you don't set up either yourself.

To send the `prod` stage's logs to Axiom, set `observability: axiom` for that stage:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x

stages:
  prod:
    observability: axiom

functions:
  hello:
    handler: handler.hello
```

Then deploy with an Axiom API token in the `AXIOM_TOKEN` environment variable:

```bash
export AXIOM_TOKEN=xaat-your-token
serverless deploy --stage prod
```

The deploy creates the `prod-aws-cloudwatch` dataset in Axiom if it doesn't exist, and the function logs appear there after the functions are invoked.

## Prerequisites for Axiom

- An Axiom account and organization. You don't need to create a dataset: the Framework finds or creates it on deploy.
- An Axiom API token in `AXIOM_TOKEN`: see [Create the Axiom API token](#create-the-axiom-api-token).
- A Serverless Framework credential: the sign-in that `serverless login` stores, an Access Key in `SERVERLESS_ACCESS_KEY` or a License Key in `SERVERLESS_LICENSE_KEY`. The Framework takes the org from the credential, so Axiom needs neither `org` nor `app` in `serverless.yml`; when `org` is set, it must name the credential's org.
- AWS credentials for the deployment's account and Region. The Framework uses both credentials on `serverless package` too.
- No function of the service instrumented by the [Serverless Framework Dashboard](./dashboard.md).

## Create the Axiom API token

The Framework reads the Axiom API token from the `AXIOM_TOKEN` environment variable on `serverless package`, `serverless deploy` and `serverless deploy function`. To create it:

1. In Axiom, open **Settings > API tokens** and select **New API token**.
2. Create an [advanced API token](https://axiom.co/docs/reference/tokens#create-advanced-api-token) that can list datasets, create datasets and ingest data into the dataset. The Framework uses no other Axiom permission.
3. Set the token in `AXIOM_TOKEN` in your shell or CI/CD pipeline, or in a `.env` or `.env.<stage>` file in the service directory. The Framework loads those files unless `useDotenv` is `false`; see [environment variables](../variables/env-vars.md).

Use an API token, which starts with `xaat-`: the forwarder stack accepts only tokens that start with `xaat-` or `xait-`.

## What the Framework deploys for Axiom

For each function, except functions with `disableLogs: true`, `serverless package` and `serverless deploy` add to the function's CloudFormation resource:

- The Axiom Lambda extension Layer in the deployment's Region, `axiom-extension-x86_64` or `axiom-extension-arm64` to match the function's `architecture` (or `provider.architecture`). The Framework looks up the latest [axiom-lambda-extension](https://github.com/axiomhq/axiom-lambda-extension) release with the GitHub API on each package and uses its number as the Layer version: release `v16` gives Layer version `16`. Axiom's Layer versions don't follow the release numbers (Axiom publishes release `v16` as Layer version `17`), so check which extension version your functions run as [Axiom's AWS Lambda guide](https://axiom.co/docs/send-data/aws-lambda) describes.
- The environment variables `AXIOM_TOKEN` (the token from your environment) and `AXIOM_DATASET` (the dataset name).

`serverless deploy function` adds the same Layer and environment variables to the function it deploys. On `serverless package` and `serverless deploy`, a function that already has 5 Layers stops the command, because Lambda allows at most 5; `serverless deploy function` doesn't check the count and sends the sixth Layer to Lambda.

After the CloudFormation deploy, `serverless deploy` does the following with the deployment's AWS credentials, in the deployment's Region. When the deploy finds no changes and skips the CloudFormation update, it skips these steps too; `--force` deploys and runs them.

1. Finds the dataset in Axiom, or creates it.
2. Creates the `<dataset>-forwarder-axiom` CloudFormation stack from Axiom's template, if it doesn't exist. The stack contains the forwarder Lambda function and its IAM role, and receives the token as a `NoEcho` parameter.
3. Creates or updates the `<dataset>-subscriber-axiom` stack, which subscribes the forwarder to every `AWS::Logs::LogGroup` resource of the service that isn't a function's log group, such as log groups in `resources`. The Framework skips this step when the service has no such log groups; no setting excludes a log group.

The Lambda extension sends function logs to Axiom directly; Lambda keeps writing them to CloudWatch Logs as well. To stop the CloudWatch copy, follow [Axiom's AWS Lambda guide](https://axiom.co/docs/send-data/aws-lambda). The Framework doesn't set `AXIOM_URL`, so the extension, the forwarder and the Framework use Axiom's default endpoint, `https://api.axiom.co`.

The token is stored in plain text in each function's `AXIOM_TOKEN` environment variable and in the service's CloudFormation template, so anyone who can read the function's configuration can read it. A later deploy updates the functions and the subscriber stack, but not the forwarder stack: after you rotate the token, update the `AxiomToken` parameter of `<dataset>-forwarder-axiom` in CloudFormation.

## Axiom dataset name

By default, the dataset name depends on the stage:

- `prod-aws-cloudwatch` for a stage named `prod` (or `production-aws-cloudwatch` for `production`), in any case: a stage named `PROD` uses `PROD-aws-cloudwatch`.
- `default-aws-cloudwatch` for every other stage.

To use another dataset, set `dataset` in the object form of the setting. The stage's own `dataset` takes precedence over the one under `stages.default`:

```yaml
# serverless.yml
stages:
  prod:
    observability:
      provider: axiom
      dataset: my-service-prod
  default:
    observability:
      provider: axiom
      dataset: my-service-dev
```

The stack names include the dataset name, so changing `dataset` creates new forwarder and subscriber stacks for the new name and leaves the old ones.

Services that deploy to the same dataset in the same AWS account and Region share the `<dataset>-forwarder-axiom` and `<dataset>-subscriber-axiom` stacks. Each deploy passes its own log groups to the subscriber stack, which adds their subscriptions and removes none, so the log groups of the other services stay subscribed.

## Turn off Axiom for a stage

To stop sending a stage's logs to Axiom, remove `observability: axiom` for that stage (or select another provider), keep `AXIOM_TOKEN` set, and deploy:

- The deploy removes the extension Layer and the Axiom environment variables from the functions.
- For the service's other log groups, the deploy creates or updates the `<dataset>-unsubscriber-axiom` stack, which removes their subscriptions to the forwarder. Without `AXIOM_TOKEN`, the deploy skips this step, and those log groups keep sending logs to Axiom.

The Framework runs the unsubscribe step on every deploy of a stage without Axiom while `AXIOM_TOKEN` is set and the service has log groups other than function log groups, also when the stage never used Axiom.

Neither the deploy nor `serverless remove` deletes the dataset or the `<dataset>-forwarder-axiom`, `<dataset>-subscriber-axiom` and `<dataset>-unsubscriber-axiom` stacks, because other services can use them. Delete the stacks in CloudFormation and the dataset in Axiom when no service uses them.

## Troubleshooting Axiom

### `No Axiom API Token found in environment variables...`

```text
No Axiom API Token found in environment variables. Please set "AXIOM_TOKEN". Sign up for Axiom here: https://slss.io/axiom
```

The command runs with Axiom as the stage's provider and `AXIOM_TOKEN` isn't set. Set it in the environment, or in `.env` or `.env.<stage>` in the service directory.

### `Failed to initialize Axiom dataset...`

```text
Failed to initialize Axiom dataset. Check your Axiom API token permissions. Original Axiom error: ...
```

Axiom answered the request that lists or creates the dataset with a `forbidden` error. Give the token the permissions to list and create datasets and to ingest data. Other Axiom errors in this step print as `Failed to initialize Axiom dataset. Original Axiom error: ...`. A `Failed to create dataset <name>. Check number of datasets limit or dataset name. Original Axiom error: ...` error means Axiom rejected the dataset name, or the organization has reached its dataset limit.

### `At least one of the provided Lambda functions is already integrated with Dashboard...`

```text
At least one of the provided Lambda functions is already integrated with Dashboard.If you want to integrate them with Axiom, please remove the integration from Dashboard first.
```

The Dashboard instruments at least one function of the service in this stage. Deploy the stage with `observability: false` to remove the Dashboard instrumentation, then switch it to `axiom`.

### `Axiom integration requires organization details...`

```text
Axiom integration requires organization details, which aren’t available right now. Please try again later.
```

The CLI has no org for the command. With a License Key, this happens when the Serverless API answers with a server error, after the warning `Serverless API temporarily unavailable`: run the command again later. Otherwise, sign in with `serverless login`, or set `SERVERLESS_ACCESS_KEY` to an Access Key of your org.

### `Lambda function <name> already has the maximum number of layers (5)`

The function already has 5 Layers, and the Axiom extension needs one more. Remove a Layer from the function, or set `disableLogs: true` on it to leave it out of Axiom.

### GitHub API rate limit exceeded

The Framework reads the latest extension release from the GitHub API on each package. Without a token, GitHub allows 60 requests per hour per IP address, which shared CI runners can exhaust. Set `GITHUB_TOKEN` to a [GitHub personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) to use the higher [authenticated rate limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api). An invalid token stops the command with `Invalid GitHub token provided. Please check the GITHUB_TOKEN environment variable.`

## Related pages

- [Observability providers](./README.md): every value of `stages.<stage>.observability`
- [Axiom's AWS Lambda guide](https://axiom.co/docs/send-data/aws-lambda)
- [Axiom CloudWatch forwarder](https://axiom.co/docs/send-data/cloudwatch)
- [Dashboard observability](./dashboard.md)
