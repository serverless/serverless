<!--
title: Serverless Framework - Variables - Terraform State Outputs
menuText: Terraform State Outputs
menuOrder: 13
description: How to reference Terraform State Outputs
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/cli-options)

<!-- DOCS-SITE-LINK:END -->

# Reference Terraform State Outputs

It is a popular use case to use Terraform and Serverless Framework in conjunction, where Terraform is used to provision shared infrastructure while Serverless Framework is used to provision app-specific infrastructure. For example, you might have some infrastructure like an RDS Database or an SQS Queue that is used by your Serverless Framework based service, as well as other apps/services at your company. In this case, the RDS Database and SQS Queue may be provisioned with Terraform, while your app provisions Lambda functions and event configurations using Serverless Framework.

In this case, it is helpful to access the Terraform State Outputs from within your serverless.yml file so at deployment time it can look up details about the shared infrastructure, like the RDS connection string, or SQS Queue ARN.

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
stages:
  default:
    resolvers:
      terraform:
        type: terraform
        backend: s3
        bucket: terraform-state
        key: users-table/terraform.tfstate

functions:
  api:
    handler: handler.handler
    events:
      - httpApi: "*"
    environment:
      DYNAMO_TABLE: ${terraform:outputs:users_table_name}
```

Before you can use the `${terraform}` parameter, you must first configure the Variable Resolver. The Variable Resolver is a new concept in Serverless Framework V.4 which allows you to use different sources for your variables. In this case, we are using the `terraform` resolver to reference the Terraform State Outputs.

To use this resolver, first you must declare the `type: terraform` resolver, which is done by providing a custom name and setting the value `type` to `terraform`. The custom name in this case is `terraform`. Other than `type`, this resolver does not require any other configuration.

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

In the `terraform` resolver we have to provide the following configuration:
- `type` - The type of the resolver. This is required and must be set to `terraform`.
- `backend` - The backend where the Terraform State Outputs are stored. In this case, the Terraform State Outputs are stored in an S3 bucket. Currently only `s3` is supported.
- `bucket` - The name of the S3 bucket where the Terraform State Outputs are stored.
- `key` - The key of the Terraform State Outputs file in the S3 bucket.
- `region` - (optional) - The region of the S3 bucket where the Terraform State Outputs are stored. This is optional and if not provided the default region will be used.
- `profile` (optional) - The AWS profile to use when fetching the Terraform State Outputs. This is optional and if not provided the default profile will be used. This can be used to reference a different AWS profile than the one used by the Serverless Framework.

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