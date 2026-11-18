<!--
title: HashiCorp Terraform and Vault Variables
description: Read Terraform state outputs and HashiCorp Vault secrets in serverless.yml with terraform and vault variable resolvers.
short_title: HashiCorp Variables
keywords:
  - Serverless Framework
  - HashiCorp
  - Terraform outputs
  - Vault secrets
  - variable resolvers
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/hashicorp)

<!-- DOCS-SITE-LINK:END -->

# HashiCorp Terraform and Vault Variables

The Serverless Framework reads values from HashiCorp tools while it loads `serverless.yml`, so a service can use infrastructure that Terraform manages and secrets that Vault stores:

- [Terraform state outputs](./terraform.md): read outputs of a Terraform state stored in an S3, HCP Terraform (`remote`) or HTTP backend, through a resolver with `type: terraform`.
- [Vault secrets](./vault.md): read secrets from a HashiCorp Vault server with `${vault:...}`, configured with environment variables or a resolver with `type: vault`.

For the variable syntax, defaults and resolvers in general, see [Variables in serverless.yml](../README.md).
