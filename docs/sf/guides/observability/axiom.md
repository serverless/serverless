<!--
title: Serverless Framework - Axiom Observability
description: How to configure observability for your Serverless Framework services using Axiom
short_title: Axiom
keywords: ['Serverless Framework', 'Observability', 'Monitoring', 'Axiom']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/observability/axiom)

<!-- DOCS-SITE-LINK:END -->

# Axiom

Axiom is a powerful observability platform that enables efficient handling, storage, and querying of extensive event data. It offers a cost-effective solution compared to AWS Cloudwatch for AWS Lambda, with a generous 500GB/month free tier, ensuring comprehensive visibility across your applications. Axiom allows you to capture, analyze, and visualize logs, metrics, and traces, providing essential tools for monitoring and troubleshooting AWS Lambda based applications.

## Enabling Axiom Observability

### Create an Axiom account and API Token

If you don't already have an Axiom account, [you can register for one here](https://slss.io/axiom). Axiom offers a very generous free tier.

Create or join an organization in Axiom – **but skip the first step of Creating A Dataset in the Axiom onboarding process** – as this will be done automatically and more correctly by the Serverless Framework. Instead, click the setting icon in the Dashboard, select [API Tokens](https://app.axiom.co/settings/api-tokens) on the left, and select New API Token.

Enter a name, choose “None” for Expiration, then click the Advanced tab to select the permissions your token should have.

Assign the `Ingest`, `Query`, `Datasets`, `Dashboards`, and `Monitors` permissions.

Set the `AXIOM_TOKEN` environment variable in your CI/CD pipeline or locally. The value should be the API token you created in Axiom.

```bash
export AXIOM_TOKEN=your-axiom-access-token
```

You can also set this in a `.env` file or stages `.env` file and the Serverless Framework will pick it up automatically.

### Configure Axiom in your Serverless Framework Service

Here is the easiest way to configure Axiom across all Stages within your serverless application. Add the `observability` property to the `stages` block in your `serverless.yml` and point it to `axiom`.

```yaml
stages:
  default:
    observability: axiom
```

Now, you're all set to start sending logs to Axiom. Deploy your service with the Serverless Framework, and you'll see logs in the Axiom platform.

Integrated logs include:

- Logs from the Lambda Functions in your service (unless `disableLogs` is set to `true` for a specific function).
- Log groups defined in the `resources` block, not associated with Lambda Functions. These will all be auto-instrumented with Axiom. There is not a way to currently disable this behavior.

## Additional Configuration

### Customizing the Axiom dataset

By default, the Serverless Framework creates a dataset in Axiom. The generated dataset name depends on the stage name:

- For the `prod` or `production` stage, the dataset name is `{stage}-aws-cloudwatch`.
- For other stages, the dataset name is `default-aws-cloudwatch`.

If you want to customize the dataset name, you can do so by adding the `dataset` property to the `observability` block in your `serverless.yml` file.

```yaml
stages:
  default:
    observability:
      provider: axiom
      dataset: my-custom-dataset
```

## Troubleshooting

### Forbidden Error

If you run into a "forbidden" error upon deployment, it is most often due to the Axiom API Token not having the correct permissions specified in this documentation. Go to the Axiom Dashboard and ensure your permissions match the ones listed in this documentation.

### GitHub API rate limit exceeded

> API rate limit exceeded for <IP_ADDRESS>. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.) - https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting``

The Serverless Framework uses the GitHub API to fetch the latest version of the Axiom AWS Lambda Layer.
GitHub enforces a rate limit of 60 requests per hour for unauthenticated requests.
To resolve this, you can set the `GITHUB_TOKEN` environment variable to authenticate the requests and increase the rate limit to 5000 requests per hour.
You can create a personal access token in the [GitHub Developer settings](https://github.com/settings/tokens).

## Disabling Axiom Observability

To disable Axiom observability for your service, remove the `observability` property from the `stages` block in your `serverless.yml` file.

Please note that:

- All Lambda Function logs will stop being sent to Axiom after the next deployment.
- Logs from log groups other than Lambda Functions will continue to be sent to Axiom until you remove the Axiom log subscriptions.
  - To remove the Axiom log subscriptions, keep the `AXIOM_TOKEN` environment variable set and deploy the service with the Serverless Framework. The log subscriptions will be removed, and no more logs will be sent to Axiom.
  - If you unset the `AXIOM_TOKEN` environment variable before deploying, the log subscriptions will remain, and logs will continue to be sent to Axiom.

The resources that are **not** removed automatically, as they might still be used by other services, include:

- The dataset.
- [Axiom CloudFormation stacks](https://github.com/axiomhq/axiom-cloudwatch-forwarder) for each dataset created:
  - {datasetName}-forwarder-axiom
  - {datasetName}-subscriber-axiom
  - {datasetName}-unsubscriber-axiom
