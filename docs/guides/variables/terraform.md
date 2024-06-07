<!--
title: Serverless Framework - Variables - HashiCorp Terraform State Outputs
menuText: HashiCorp Terraform State Outputs
menuOrder: 13
description: How to reference HashiCorp Terraform State Outputs
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/terraform)

<!-- DOCS-SITE-LINK:END -->

# Reference HashiCorp Terraform State Outputs

It is a popular use case to use Terraform and Serverless Framework in conjunction, where Terraform is used to provision shared infrastructure while Serverless Framework is used to provision app-specific infrastructure. For example, you might have some infrastructure like an RDS Database or an SQS Queue that is used by your Serverless Framework based service, as well as other apps/services at your company. In this case, the RDS Database and SQS Queue may be provisioned with Terraform, while your app provisions Lambda functions and event configurations using Serverless Framework.

In this case, it is helpful to access the Terraform State Outputs from within your serverless.yml file so at deployment time it can look up details about the shared infrastructure, like the RDS connection string, or SQS Queue ARN.

The Terraform Variable Resolver supports getting the Terraform State Outputs from either an `s3`, `remote`, or `cloud` backend. The `s3` backend is used when the Terraform State is stored in an S3 bucket, while the `remote` backend is used when the Terraform States is stored in a remote backend like Terraform HCP or compatible services like JFrog Artifactory Terraform Backend Repository.


## Getting Outputs From The `s3` Backend

Suppose you have a Terraform configuration that creates a DynamoDB table and you want to reference the name and ARN of the table in your serverless.yml file. You can use the `terraform` resolver to reference the Terraform State Outputs.

```hcl
# Configures the Terraform backend to store state in an S3 bucket
terraform {
  backend "s3" {
    bucket         = "terraform-state"
    key            = "users-table/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock-table"
  }
}

provider "aws" {
  region = "us-east-1"
}

# Creates a DynamoDB table called users-table-dev
resource "aws_dynamodb_table" "users_table" {
  name         = "users-table-dev"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "UserId"

  attribute {
    name = "UserId"
    type = "S"
  }
}

# Outputs for the name and ARN of the users-table-dev DynamoDB table
output "users_table_name" {
  description = "The name of the Users DynamoDB table"
  value       = aws_dynamodb_table.users_table.name
}

output "users_table_arn" {
  description = "The ARN of the Users DynamoDB table"
  value       = aws_dynamodb_table.users_table.arn
}
```

After the `terraform apply` the Terraform State Outputs will be stored in the S3 bucket `terraform-state` in the `users-table/terraform.tfstate` file.

Those outputs can be referenced in the `serverless.yml` file like this:

```yaml
${terraform:outputs:users_table_name}
```

In this example we use the variable `${terraform}`; however, you can use any name you want. The `outputs` is a fixed key that is used to reference the Terraform State Outputs. The `users_table_name` is the name of the output in the Terraform configuration file.

Before you can use the `${terraform}` parameter, you must first configure the Variable Resolver. The Variable Resolver is a new concept in Serverless Framework V.4 which allows you to use different sources for your variables. In this case, we are using the `terraform` resolver to reference the Terraform State Outputs.

To use this resolver, you must declare the `type: terraform` resolver, which is done by providing a custom name and setting the value `type` to `terraform`. The custom name in this case is `terraform`. Other than `type`, this resolver does not require any other configuration.

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

As you can see from this configuration, these values all match the values in the terraform backend configuration in the Terraform configuration file.

Now the `${terraform:outputs:users_table_name}` variable can be used in the `serverless.yml` file to reference the `users_table_name` output from the Terraform State Outputs.

Since Variable Resolvers are a new concept in Serverless Framework V.4 it is worth mentioning that the variable reference, `${terraform:outputs}` is based on the keys declared in the `resolvers` section of the `serverless.yml`

For example, if we changes the configuration and replaced `terraform:` with `infra:`, then we'd have to use `${infra:outputs:users_table_name}` instead of `${terraform:outputs:users_table_name}`.

```yaml
stages:
  default:
    resolvers:
      infra:
        type: terraform
```


## Getting Outputs From The `remote` or `cloud` Backend

Suppose you have a Terraform configuration that creates a DynamoDB table and you want to reference the name and ARN of the table in your serverless.yml file. You can use the `terraform` resolver to reference the Terraform State Outputs.

```hcl
# Configures the Terraform backend to store state in an remote backend
terraform {
  # Also works with the `cloud` backend
  backend "remote" {
    organization = "my-org"
    workspaces {
      name = "my-workspace"
    }
  }
}

# Everything else is the same as the S3 example
```

After the `terraform apply` the Terraform State Outputs will be stored in the remote backend for he workspace `my-workspace` in the organization `my-org`.

To use this resolver, you must declare the `type: terraform` resolver, which is done by providing a custom name and setting the value `type` to `terraform`. The custom name in this case is `terraform`. Other than `type`, this resolver does not require any other configuration.

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

Now the `${terraform:outputs:users_table_name}` variable can be used in the `serverless.yml` file to reference the `users_table_name` output from the Terraform State Outputs.
