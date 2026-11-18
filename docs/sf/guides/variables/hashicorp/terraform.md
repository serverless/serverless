<!--
title: Terraform State Output Variables
description: Read Terraform state outputs in serverless.yml from S3, HCP Terraform (remote) or HTTP backends with a terraform variable resolver.
short_title: Terraform State Outputs
keywords: ['Serverless Framework', 'HashiCorp', 'Terraform', 'Terraform outputs', 'HCP Terraform', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/hashicorp/terraform)

<!-- DOCS-SITE-LINK:END -->

# Terraform State Output Variables

A Terraform resolver reads the outputs of a Terraform state while the Serverless Framework loads `serverless.yml`. Use it when Terraform manages shared infrastructure, such as a database or a queue, and a Serverless Framework service needs its ARN, URL or connection details. The resolver reads the state from an S3, HCP Terraform (`remote`) or HTTP backend.

The following `serverless.yml` reads the `users_table_arn` output of a state stored in S3:

```yaml
# serverless.yml
service: my-service

stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: s3
        bucket: my-terraform-state
        key: users-table/terraform.tfstate

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello
    environment:
      USERS_TABLE_ARN: ${terraform:outputs:users_table_arn}
```

The Terraform configuration declares the output:

```hcl
output "users_table_arn" {
  value = aws_dynamodb_table.users_table.arn
}
```

## Syntax of the Terraform variable

```text
${RESOLVER_NAME:outputs:OUTPUT_NAME}
${RESOLVER_NAME:outputs:OUTPUT_NAME.PROPERTY}
```

- `RESOLVER_NAME`: the name of a resolver with `type: terraform` under `stages.<stage>.resolvers` (`terraform` in the example). A Terraform variable always needs a declared resolver, and each resolver reads one state; declare several resolvers, each with its own name, to read several states.
- `OUTPUT_NAME`: the name of the output in the Terraform configuration.
- `PROPERTY`: a dot path inside an object or list output, for example `${terraform:outputs:db.host}`.

The variable keeps the output's type: a string, number, boolean, list or object. When the output doesn't exist, the variable uses its default (`${terraform:outputs:users_table_arn, 'none'}`), otherwise the command stops with a `Cannot resolve` error. An error reading the state, such as a missing state file, a rejected token or a network failure, stops the command even when a default is set.

## Read state from an S3 backend

To read a state stored by Terraform's [`s3` backend](https://developer.hashicorp.com/terraform/language/backend/s3), set `backend: s3` with the bucket and key from the Terraform backend configuration:

```yaml
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: s3
        bucket: my-terraform-state
        key: users-table/terraform.tfstate
        region: us-east-1
```

| Key      | Type   | Default                                                   | Description                                                                                                         |
| -------- | ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `bucket` | String | Required                                                  | Bucket that holds the state file.                                                                                   |
| `key`    | String | Required                                                  | Object key of the state file.                                                                                       |
| `region` | String | `AWS_REGION`, then the `region` of the active AWS profile | Region of the bucket. `provider.region` isn't used. Without any Region, the command stops with `Region is missing`. |

The S3 backend reads the state with the AWS SDK's default credential chain: environment variables, the `AWS_PROFILE` environment variable, or the default profile. It doesn't use `provider.profile`, an `aws` resolver or Serverless Framework Dashboard provider credentials, so the identity that reads the state can differ from the one that deploys. Make sure the default credentials can read the bucket (`s3:GetObject` on the state file), or set `AWS_PROFILE` for the command:

```bash
AWS_PROFILE=my-profile serverless deploy
```

## Read state from HCP Terraform or Terraform Enterprise

To read the current state of an HCP Terraform or Terraform Enterprise workspace, set `backend: remote`. Use it for Terraform configurations with a `cloud {}` block or a `remote` backend:

```yaml
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: remote
        organization: my-org
        workspace: my-workspace
```

| Key            | Type   | Default                            | Description                                                                                                  |
| -------------- | ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `organization` | String | None                               | Organization of the workspace. Required with `workspace`.                                                    |
| `workspace`    | String | None                               | Workspace name. Required with `organization`.                                                                |
| `workspaceId`  | String | None                               | Workspace ID (`ws-...`), instead of `organization` and `workspace`.                                          |
| `token`        | String | See the following paragraph        | API token that can read the workspace's state outputs.                                                       |
| `hostname`     | String | `https://app.terraform.io/api/v2/` | Base URL of the Terraform API, ending with `/`. For Terraform Enterprise, use `https://<your-host>/api/v2/`. |

Set either `organization` and `workspace`, or `workspaceId`; otherwise the configuration stops with `Either 'workspaceId' or 'organization' and 'workspace' are required`. When all three are set, `organization` and `workspace` are used.

Without `token`, the resolver reads the `TF_TOKEN_<host>` environment variable, where `<host>` is the API host name with dots replaced by underscores (`TF_TOKEN_app_terraform_io`), then `TF_CLOUD_TOKEN`. To keep the token out of `serverless.yml`, use one of these variables or `token: ${env:MY_TF_TOKEN}`.

## Read state from an HTTP backend

To read a state served by Terraform's [`http` backend](https://developer.hashicorp.com/terraform/language/backend/http), set `backend: http`:

```yaml
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: http
        address: https://state.example.com/users-table
```

| Key        | Type   | Default            | Description                                                                                        |
| ---------- | ------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| `address`  | String | `TF_HTTP_ADDRESS`  | URL the resolver reads the state from with `GET`. Required in the key or the environment variable. |
| `username` | String | `TF_HTTP_USERNAME` | User name for HTTP basic authentication.                                                           |
| `password` | String | `TF_HTTP_PASSWORD` | Password for HTTP basic authentication.                                                            |

The environment variables are the ones Terraform itself reads for the `http` backend, so a shell set up for Terraform needs no keys besides `type` and `backend`.

## Terraform resolver settings

Every Terraform resolver needs `type: terraform` and `backend`, one of `s3`, `remote` or `http`. Each backend accepts only the keys in its section; another key stops the command with an error that names the allowed keys.

## Requests and rate limits

The Framework resolves all variables concurrently before a command runs and reads each Terraform state once per run: a service that references twenty outputs of the same state reads it once, and services deployed together with Serverless Framework Compose share that read. This applies to every backend.

For the `s3` backend, a request that Amazon S3 throttles is retried with the AWS SDK's standard exponential backoff, up to 10 attempts by default. Run with `--verbose` to see each retry, and with `--debug` to see a summary of the requests (`terraform: … state files, … GetObject calls`). When the retries run out, the command stops with the `RESOLVER_AWS_RATE_EXCEEDED` error, which names the API, the number of attempts and how many state files the run referenced. The retry settings follow the same precedence as in every AWS SDK and the AWS CLI: the `AWS_MAX_ATTEMPTS` and `AWS_RETRY_MODE` environment variables, then the `max_attempts` and `retry_mode` keys in `~/.aws/config`. See [Retry behavior in the AWS SDKs and Tools Reference Guide](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

A download interrupted by the network stops the command with `Error fetching Terraform outputs from S3: Error: aborted`; run the command again.

Functions in a `serverless dev` session run with their deployed configuration, so values resolved from a Terraform state reach them after the next `serverless deploy`.

## Related

- [Variables in serverless.yml](../README.md): syntax, defaults and resolvers.
- [Vault secrets](./vault.md): read secrets from HashiCorp Vault.
- [AWS variables and resolvers](../aws/README.md): read SSM, S3 and CloudFormation values.
