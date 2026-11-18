<!--
title: Development Workflow
description: 'A recommended day-to-day workflow for Serverless Framework services on AWS Lambda: personal stages, Dev Mode, fast deploys, logs, CI/CD and cleanup.'
short_title: Development Workflow
keywords:
  [
    'Serverless Framework',
    'AWS Lambda development workflow',
    'Dev Mode',
    'stages',
    'CI/CD',
    'CLI cheat sheet',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/workflow)

<!-- DOCS-SITE-LINK:END -->

# Development Workflow

This page describes a workflow that keeps the feedback loop short while you build a Serverless Framework service on AWS Lambda: each developer works in a personal stage, edits code against real AWS events with Dev Mode, and lets CI/CD deploy the shared stages. It ends with a cheat sheet of the commands each step uses.

The loop on a personal stage named after you looks like this:

```bash
serverless deploy --stage alice
serverless dev --stage alice
serverless deploy --stage alice
serverless remove --stage alice
```

Deploy the stage once, run Dev Mode while you change handler code, deploy again after you change `serverless.yml`, and remove the stage when you no longer need it.

## Give each developer a stage

A stage is a separate deployment of the same service: its own CloudFormation stack, functions and resources, named after the stage (`my-service-alice`). The stage comes from `--stage`, else `provider.stage`, else `dev`.

- Use a personal stage per developer (`--stage alice`), so one person's deploys and Dev Mode sessions never change another's functions.
- Keep shared stages such as `staging` and `prod` for CI/CD.
- Put stages that hold production data in a separate AWS account from development stages ([AWS Credentials](../providers/aws/guide/credentials.md)).
- Set stage-specific values under `stages.<stage>.params` and read them with `${param:…}` ([Parameters](./parameters.md)), instead of branching on the stage name in code.

## Develop against real events with Dev Mode

[Dev Mode](../providers/aws/guide/dev-mode.md) (`serverless dev`) runs the Node.js (including TypeScript) and Python functions of a deployed stage on your machine. Real invocations of the stage, such as API requests, queue messages and direct invokes, run the code in your working copy, with the deployed function's environment variables and IAM role. Save a file and the next invocation runs it, with no redeploy. When you stop the session with Ctrl+C, `q` or `serverless dev stop`, the functions return to their deployed configuration. A session that crashed, was killed or was stopped with a second Ctrl+C leaves functions attached, running their deployed code, until `serverless dev restore`, the next `serverless dev` or a deploy restores them ([Stop a session and recover functions](../providers/aws/guide/dev-mode.md#stop-a-session-and-recover-functions)).

```bash
serverless dev --stage alice
```

- Dev Mode refuses the `prod` and `production` stages; use it on a personal or development stage.
- A stage that was never deployed is deployed first.
- Functions in other runtimes, container image functions and Lambda@Edge functions keep running their deployed code.
- Scripts and AI coding agents run a session in the background with `serverless dev --detach` and stop it with `serverless dev stop` ([`serverless dev`](../providers/aws/cli-reference/dev.md)).

## Deploy changes

Choose the deploy command by what changed:

- After a change to `serverless.yml` (functions, events, resources, IAM, settings), run `serverless deploy --stage alice`. It deploys the whole service through CloudFormation, and skips the deployment when nothing changed.
- To push one function's code and configuration without CloudFormation, run `serverless deploy function -f hello --stage alice`. It doesn't deploy events or resources, leaves the function out of sync with the stack, and a later `serverless deploy` doesn't undo a configuration change it made. Use it on personal stages only ([`serverless deploy function`](../providers/aws/cli-reference/deploy-function.md)).

To see what a deploy would change first, run `serverless diff --stage alice` ([`serverless diff`](../providers/aws/cli-reference/diff.md)).

## Test and debug a deployed function

Invoke a function in AWS and print its log output:

```bash
serverless invoke -f hello --stage alice --log
```

Follow a function's logs in a separate terminal while you send requests:

```bash
serverless logs -f hello --stage alice --tail
```

Write unit tests for handler logic that run locally without AWS, and keep tests that need AWS resources for a deployed stage ([Testing](../providers/aws/guide/testing.md)).

## Deploy shared stages from CI/CD

Let a pipeline deploy `staging` and `prod`, so every change to those stages comes from version control:

```bash
serverless deploy --stage prod --region us-east-1
```

In the pipeline:

- Authenticate the CLI with a secret in `SERVERLESS_ACCESS_KEY` (an Access Key) or `SERVERLESS_LICENSE_KEY` ([License Keys](./license-keys.md)). Without a terminal, the CLI doesn't prompt you to sign in: when the CLI finds no credential (no key variable, no `serverless login` session, no `licenseKey`, no saved key and no License Key in the `/serverless-framework/license-key` SSM parameter), the command stops with an error that names the keys to set.
- Give the pipeline AWS credentials for the stage's account, for example through your CI provider's OpenID Connect integration or environment variables ([AWS Credentials](../providers/aws/guide/credentials.md)).
- Pin the Framework version with `frameworkVersion` in `serverless.yml`, so the pipeline and developers deploy with the same CLI.

## Split larger projects into services

Keep each service small enough to deploy quickly and to reason about:

- Split an application into several services, each with its own `serverless.yml`, around a data model or a workflow.
- Keep long-lived resources such as databases and queues in their own services, deployed less often than the code that uses them.
- Deploy related services together, and pass outputs between them, with [Serverless Compose](./compose.md).

## Clean up personal stages

Remove a stage you no longer use, so it stops running and costing money:

```bash
serverless remove --stage alice
```

**Warning:** `serverless remove` deletes the stage's CloudFormation stack, including its functions and every resource defined in the service, such as tables and buckets. Check the stage name before you run it.

CloudFormation keeps a resource with a `DeletionPolicy` of `Retain`, and by default takes a final snapshot of an `AWS::RDS::DBCluster` and of an `AWS::RDS::DBInstance` without `DBClusterIdentifier` before deleting it ([`DeletionPolicy` attribute](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html)). Retained resources and snapshots stay in the account and keep incurring charges until you delete them, so check for them after the stack is removed.

CloudFormation deletes an S3 bucket only when it is empty, and `serverless remove` empties only the service's files in the deployment bucket. When a bucket defined in `resources` still holds objects, the stack deletion stops and the stack is left in the `DELETE_FAILED` state. Empty that bucket, including every object version and delete marker in a versioned bucket ([Emptying a general purpose bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/empty-bucket.html)), then run `serverless remove` again.

## Command cheat sheet

| Task                                      | Command                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| Create a service from a template          | `serverless`                                           |
| Deploy the whole service                  | `serverless deploy --stage STAGE --region REGION`      |
| Deploy with detailed progress             | `serverless deploy --stage STAGE --verbose`            |
| Deploy one function's code and settings   | `serverless deploy function -f FUNCTION --stage STAGE` |
| Run the stage's functions locally         | `serverless dev --stage STAGE`                         |
| Invoke a deployed function and print logs | `serverless invoke -f FUNCTION --stage STAGE --log`    |
| Follow a function's logs                  | `serverless logs -f FUNCTION --stage STAGE --tail`     |
| Show the stage's endpoints and outputs    | `serverless info --stage STAGE`                        |
| Remove the stage                          | `serverless remove --stage STAGE`                      |

Replace `STAGE`, `REGION` and `FUNCTION` with your stage, AWS Region and the function's key under `functions` in `serverless.yml`. `-s`, `-r` and `-f` are the short forms of `--stage`, `--region` and `--function`; `-v` prints the CLI version, not verbose output.

## Related pages

- [Dev Mode](../providers/aws/guide/dev-mode.md): run a deployed stage's functions on your machine.
- [Deploying to AWS](../providers/aws/guide/deploying.md): how `serverless deploy` works.
- [Parameters](./parameters.md): stage-specific values.
- [Serverless Compose](./compose.md): deploy several services together.
