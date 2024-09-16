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

The Terraform Variable Resolver supports getting the Terraform State Outputs `s3`, `remote`,`cloud`, or `http` backend.

## Getting Terraform Outputs from Remote Backends

Terraform supports using a remote backend to store the state of the infrastructure. The state can be stored in a number of support remote backends like AWS S3, Terraform HCP, or HTTP.

The Terraform output variable resolver in Serverless Framework V.4 only supports the S3, Remote, and HTTP backends, therefore one of these four options must be used.

In all the examples we'll assume a Terraform configuration that creates a DynamoDB table and outputs the ARN of the table in the `users_table_arn` output.

```
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
- `region` - (optional) - The region of the S3 bucket where the Terraform State Outputs are stored. This is optional and if not provided the default region will be used.

The resolver uses the current AWS account credentials, the same ones being used for the deployment, so the S3 bucket containing the state must reside in that account. Support for pointing to a secondary AWS account is coming soon.

The `bucket` and `key` properties match the values in the terraform backend configuration in the Terraform configuration file.

## Configuring the `remote` or `cloud` Backend

To use this resolver, you must declare the resolver with `type: terraform` and `backend: remote` under `stages.<stage>.resolvers.<key>` in the `serverless.yml`.

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

In the `terraform` resolver supports the following configuration if the `backend` is `remote`:

- `address` - (optional) The HTTP address of the Terraform http backend where the Terraform State Outputs are stored.
- `username` - (optional) The username to use to access the Terraform State Outputs.
- `password` - (optional) The password to use to access the Terraform State Outputs.

While, `address`, `username`, and `password` are optional, you must provide an address either via the `address` configuration or the `TF_HTTP_ADDRESS` environment variable.

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
