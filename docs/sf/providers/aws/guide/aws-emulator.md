<!--
title: Deploy to AWS Emulator
description: Deploy, invoke, call and remove a Serverless Framework service on AWS Emulator, AWS's local emulator of the AWS APIs, without an AWS account.
short_title: AWS Emulator
keywords:
  [
    'Serverless Framework',
    'AWS Emulator',
    'local AWS emulator',
    'AWS_ENDPOINT_URL',
    'local testing',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/aws-emulator)

<!-- DOCS-SITE-LINK:END -->

# Deploy to AWS Emulator

[AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html) is AWS's local emulator of the AWS APIs: one process on your machine that answers AWS SDK and AWS CLI requests, without an AWS account. The Serverless Framework deploys into it with the environment variables AWS documents for pointing an SDK at the emulator, so `serverless deploy`, `invoke`, `logs` and `remove` run against emulated resources instead of AWS. Use it to try a service's deployment and wiring locally, in seconds and at no cost, before you deploy to a stage in AWS.

Your handlers don't run on the Lambda Node.js or Python runtimes there, and the emulator doesn't evaluate IAM policies the way AWS does, so keep a test stage in AWS for the checks that depend on them ([Limits](#limits)).

## Start AWS Emulator

Install and start the emulator as AWS describes: from the RPM or Debian package on Linux ([Getting started on Linux](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-linux.html)), or in Docker on macOS and Windows ([Getting started with Docker](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-docker.html)). On Linux:

```bash
aws-emulator
```

The emulator serves HTTPS on `https://127.0.0.1:9297` and writes its access keys, a `config` file and its certificate to `~/.aws/emulator/9297/`. It keeps every resource in memory and deletes them when it stops.

## Point the Framework at the emulator

In the shell where you run the Framework, set the variables from AWS's [Pointing your AWS SDK at AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/point-sdk-to-emulator.html#point-sdk-env), plus `NODE_EXTRA_CA_CERTS`, which makes Node.js, and so the Framework, trust the emulator's certificate. Then unset the variables that can supply real AWS credentials:

```bash
export AWS_ENDPOINT_URL=https://127.0.0.1:9297
export AWS_SHARED_CREDENTIALS_FILE=~/.aws/emulator/9297/emulator_credentials
export AWS_CONFIG_FILE=~/.aws/emulator/9297/config
export AWS_CA_BUNDLE=~/.aws/emulator/9297/ca.pem
export NODE_EXTRA_CA_CERTS=~/.aws/emulator/9297/ca.pem
export AWS_EC2_METADATA_DISABLED=true
export AWS_DISABLE_HOST_PREFIX_INJECTION=true
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE
```

If you use a port other than 9297, replace it in each value. `AWS_CA_BUNDLE` serves the AWS CLI; the Framework and other Node.js programs read only `NODE_EXTRA_CA_CERTS`, which Node.js reads when it starts, so set it before you run a command.

Leave `provider.profile` unset in `serverless.yml`, and don't pass `--aws-profile`: a profile that holds your own credentials signs the requests with them, and the emulator rejects them. To check that the shell reaches the emulator, run `aws sts get-caller-identity`: the account is `000000000000`.

**Note:** The Framework still signs in to Serverless with your license key or access key, so the machine needs internet access for that, while every AWS request goes to the emulator.

## Deploy, invoke and remove a service

This service has one Node.js function behind an HTTP API:

```yaml
# serverless.yml
service: my-service
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs26.x
  region: us-east-1

functions:
  hello:
    handler: handler.hello
    events:
      - httpApi:
          path: /
          method: get
```

```javascript
// handler.mjs
export const hello = async (event) => ({
  statusCode: 200,
  body: JSON.stringify({ message: 'Hello', path: event.rawPath }),
})
```

Deploy it with the variables from [Point the Framework at the emulator](#point-the-framework-at-the-emulator) set:

```bash
serverless deploy --stage local
```

Every command first names the endpoint it sends AWS requests to:

```text
Using the configured AWS endpoint https://127.0.0.1:9297
Deploying "my-service" to stage "local" (us-east-1)
✔ Service deployed to stack my-service-local (6s)
endpoint: GET - https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com/
```

Invoke the function, read its logs, and update it, with the same commands you use against AWS:

```bash
serverless invoke --function hello --stage local
serverless logs --function hello --stage local
serverless deploy function --function hello --stage local
```

When you're done, remove the service:

```bash
serverless remove --stage local
```

## Call an HTTP API on the emulator

The `endpoint` that `serverless deploy` and `serverless info` print is the URL the API would have in AWS. The emulator serves the API on its own address and picks the API by the request's `Host` header, so send the request to `https://127.0.0.1:9297` with the printed host name in the header:

```bash
curl --cacert ~/.aws/emulator/9297/ca.pem \
  -H "Host: a1b2c3d4e5.execute-api.us-east-1.amazonaws.com" \
  https://127.0.0.1:9297/
```

Replace `a1b2c3d4e5` with the API ID from your deploy output.

## Run a handler on your machine against the emulator

[`serverless invoke local`](../cli-reference/invoke-local.md) runs a handler on your machine's Node.js or Python, with the same variables set. AWS SDK clients in the handler read `AWS_ENDPOINT_URL` too, so the handler's calls to S3, DynamoDB and other services reach the emulated resources. They use the emulator's keys from `AWS_SHARED_CREDENTIALS_FILE`, not the function's IAM role.

## Limits

These facts are from AWS Emulator 1.0.620 and its documentation, checked on 2026-11-25. The emulator changes several times a day; for the current state, see [Fidelity in AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/fidelity.html) and its [releases on GitHub](https://github.com/aws/aws-emulator/releases).

- **Handler runtimes.** The emulator runs Node.js and Python functions packaged as `.zip` files inside its own process, on embedded JavaScript and Python engines (QuickJS and RustPython in the [emulator's source](https://github.com/aws/aws-emulator)), not on the Lambda runtimes. A Node.js handler sees `process.versions` as `{ "node": "22.0.0" }`, no `WebAssembly`, no `process.memoryUsage`, and `Intl` formatting that ignores the locale; CPU-bound code runs much slower than on Lambda. A function on another runtime deploys, but invoking it returns `InvalidRuntimeException`. Run the tests that depend on runtime behavior in a test stage in AWS, or with [Dev Mode](./dev-mode.md).
- **IAM.** The emulator doesn't evaluate IAM policies and resource-based policies the way AWS does ([Limitations](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html#what-is-limits)). A function's execution role is applied to some calls, but don't use the emulator to test permissions.
- **CloudFormation.** Stacks, change sets and the resources of a basic service (functions, versions, permissions, log groups, IAM roles and an HTTP API) deploy and update. Coverage of other resource types and of integrations such as API Gateway authorizers varies; the emulator's repository tracks the gaps.
- **One Region, one account.** The emulator keeps one set of resources for every Region and account; its account ID is `000000000000`. Use one Region per emulator.
- **State.** Resources live in memory and are gone when the emulator stops, so deploy again after a restart.
- **Dev Mode.** [Dev Mode](./dev-mode.md) relays invocations of functions deployed to AWS through AWS IoT Core, so it works with a stage in AWS, not with the emulator.

## Switch back to AWS

The variables above send every AWS request of the shell to the emulator. To deploy to AWS again, open a new shell, or unset them:

```bash
unset AWS_ENDPOINT_URL AWS_SHARED_CREDENTIALS_FILE AWS_CONFIG_FILE AWS_CA_BUNDLE NODE_EXTRA_CA_CERTS AWS_DISABLE_HOST_PREFIX_INJECTION
```

How the Framework reads endpoint settings, and how to turn them off for one command: [AWS endpoint settings](./deploying.md#aws-endpoint-settings).

## Related

- [Testing Lambda functions](./testing.md)
- [Dev Mode](./dev-mode.md)
- [AWS endpoint settings](./deploying.md#aws-endpoint-settings)
- [AWS Emulator User Guide](https://docs.aws.amazon.com/emulator/latest/userguide/what-is-service.html)
