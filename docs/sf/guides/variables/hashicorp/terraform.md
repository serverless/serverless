<!--
title: Serverless Framework - Variables - HashiCorp Terraform State Outputs
description: How to reference HashiCorp Terraform State Outputs
short_title: Serverless Variables - HashiCorp Terraform State Outputs
keywords: ['Serverless Framework', 'HashiCorp', 'Terraform', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/hashicorp/terraform)

<!-- DOCS-SITE-LINK:END -->

# Reference HashiCorp Terraform State Outputs

It is a popular use case to use Terraform and Serverless Framework in conjunction, where Terraform is used to provision shared infrastructure while Serverless Framework is used to provision app-specific infrastructure. For example, you might have some infrastructure like an RDS Database or an SQS Queue that is used by your Serverless Framework based service, as well as other apps/services at your company. In this case, the RDS Database and SQS Queue may be provisioned with Terraform, while your app provisions Lambda functions and event configurations using Serverless Framework.

In this case, it is helpful to access the Terraform State Outputs from within your serverless.yml file so at deployment time it can look up details about the shared infrastructure, like the RDS connection string, or SQS Queue ARN.

The Terraform Variable Resolver supports reading Terraform state outputs from the `s3`, `remote` (including HCP Terraform, formerly Terraform Cloud), and `http` backends.

## Getting Terraform Outputs from Remote Backends

Terraform supports using a remote backend to store the state of the infrastructure. The state can be stored in a number of support remote backends like AWS S3, HCP Terraform, or HTTP.

The Terraform output variable resolver in Serverless Framework V.4 only supports the S3, Remote, and HTTP backends, therefore one of these three backends must be used.

In all the examples we'll assume a Terraform configuration that creates a DynamoDB table and outputs the ARN of the table in the `users_table_arn` output.

```hcl
# Configures the Terraform backend to store state in an S3 bucket
terraform {
  # cloud {} - compatible with remote backend
  # backend "s3" { }
  # backend "remote" { }
  # backend "http" { }
}

# ...

output "users_table_arn" {
  description = "The ARN of the Users DynamoDB table"
  value       = aws_dynamodb_table.users_table.arn
}
```

To access this output in the `serverless.yml` file, you can use the `${terraform}` variable resolver.

```yaml
${terraform:outputs:users_table_arn}
```

## Configuring the `s3` Backend

To use this resolver, you must declare the resolver with `type: terraform` and `backend: s3` under `stages.<stage>.resolvers.<key>` in the `serverless.yml`.

```yaml
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: s3
        bucket: terraform-state
        key: users-table/terraform.tfstate
```

In the `terraform` resolver supports the following configuration if the `backend` is `s3`:

- `bucket` - The name of the S3 bucket where the Terraform State Outputs are stored.
- `key` - The key of the Terraform State Outputs file in the S3 bucket.
- `region` - (optional) - The region of the S3 bucket where the Terraform State Outputs are stored. If not provided, the region comes from the AWS SDK's default settings (the `AWS_REGION` environment variable or the `region` of the active AWS profile). The resolver does not use `provider.region`; if no region can be found, the resolver fails with `Region is missing`.

The resolver reads the state file with the AWS credentials from the AWS SDK's default credential chain: environment variables, the `AWS_PROFILE` environment variable, or the default profile in `~/.aws`. It does not use `provider.profile`, an `aws` resolver's `profile`, or Serverless Dashboard provider credentials, so the identity that reads the state bucket can differ from the identity that deploys the service. Make sure the default credentials can read the bucket, or export the deployment profile as `AWS_PROFILE` for the run.

The `bucket` and `key` properties match the values in the terraform backend configuration in the Terraform configuration file.

## Configuring the `remote` Backend

To use this resolver, you must declare the resolver with `type: terraform` and `backend: remote` under `stages.<stage>.resolvers.<key>` in the `serverless.yml`. A Terraform configuration that uses the `cloud {}` block is read with `backend: remote` as well.

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

In the `terraform` resolver supports the following configuration if the `backend` is `remote`:

- `organization` - (optional) The name of the Terraform Cloud organization where the Terraform State Outputs are stored.
- `workspace` - (optional) The name of the Terraform Cloud workspace where the Terraform State Outputs are stored.
- `workspaceId` - (optional) The ID of the Terraform Cloud workspace where the Terraform State Outputs are stored.
- `token` - (optional) The Terraform Cloud API token to use to access the Terraform State Outputs. This is required if the Terraform Cloud workspace is private.
- `hostname` - (optional) The hostname of the Terraform Cloud API. This is optional and if not provided the default hostname will be used.

While `organization`, `workspace`, and `workspaceId` are optional, you must provide either the organization & workspace, or the workspaceId.

If no token is provided then the resolver will try to get the token from the `TF_CLOUD_TOKEN` environment variable, or from the `~/.terraform.d/credentials.tfrc.json` file.

## Configuring the `http` Backend

To use this resolver, you must declare the resolver with `type: terraform` and `backend: http` under `stages.<stage>.resolvers.<key>` in the `serverless.yml`.

```yaml
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: http
```

In the `terraform` resolver supports the following configuration if the `backend` is `http`:

- `address` - (optional) The HTTP address of the Terraform http backend where the Terraform State Outputs are stored.
- `username` - (optional) The username to use to access the Terraform State Outputs.
- `password` - (optional) The password to use to access the Terraform State Outputs.

While, `address`, `username`, and `password` are optional, you must provide an address either via the `address` configuration or the `TF_HTTP_ADDRESS` environment variable.

## Requests and rate limits

The Framework resolves all variables concurrently before a command runs, and reads each Terraform state once per run: a service that references twenty outputs of the same state reads it once, and services deployed together with Serverless Framework Compose share that read when they run in the same command. This applies to every backend (`s3`, `remote`, `http`).

For the `s3` backend, a request that Amazon S3 throttles is retried with the AWS SDK's standard exponential backoff, up to 10 attempts by default. Run with `--verbose` to see each retry, and with `--debug` to see a summary of the requests made (`terraform: … state files, … GetObject calls`). If the retries are exhausted, the command fails with the `RESOLVER_AWS_RATE_EXCEEDED` error, which names the API, the number of attempts, and how many state files the run referenced. The retry settings follow the same precedence as in every AWS SDK and the AWS CLI: the `AWS_MAX_ATTEMPTS` and `AWS_RETRY_MODE` environment variables, then the `max_attempts` and `retry_mode` keys in `~/.aws/config`; the Framework default applies only when none of them is set. See [Retry behavior in the AWS SDKs and Tools Reference Guide](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html).

A download that is interrupted by the network fails the command with `Error fetching Terraform outputs from S3: Error: aborted`; rerun the command. Because each state is read once per resolution pass rather than once per referenced output, such a failure can occur at most once per state file per pass.

During `serverless dev`, the state read at startup is kept for the whole session. Restart the session after `terraform apply` to pick up new outputs.

## Resolvers in Serverless Framework V.4

The Terraform Variable Resolver is a new feature in Serverless Framework V.4. It is part of a new feature called Variable Resolvers that allows you to reference external data sources in your `serverless.yml` file. The Terraform Variable Resolver is one of the first resolvers available, with more resolvers planned for the future.

Since Variable Resolvers are a new concept in Serverless Framework V.4 it is worth mentioning that the variable reference, `${terraform:outputs}` is based on the keys declared in the `resolvers` section of the `serverless.yml`

For example, we can change the `terraform: ` key to `infra:` like this:

```yaml
stages:
  default:
    resolvers:
      infra: # Previously this was "terraform"
        type: terraform
```

With this change, the variable reference must be updated from `${terraform:outputs:users_table_name}` to `${infra:outputs:users_table_name}`.

As you can see, the `<key>` in the `stages.<stage>.resolvers.<key>` path is used to reference the resolver in the variable reference, `${<key>:outputs:users_table_name}`.

This also means you can have multiple resolvers in the `serverless.yml` file, each with a unique key and configuration, and reference them in the `serverless.yml` file using their unique keys.
