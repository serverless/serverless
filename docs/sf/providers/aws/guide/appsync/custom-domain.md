<!--
title: Serverless Framework - AppSync - Custom Domains
description: How to configure custom domains for AWS AppSync with the Serverless Framework.
short_title: AppSync - Custom Domains
keywords:
  [
    'Serverless Framework',
    'AppSync',
    'Custom Domains',
    'GraphQL',
    'AWS',
  ]
-->

# Custom Domains

AppSync supports associating your API to a [custom domain](https://aws.amazon.com/blogs/mobile/introducing-custom-domain-names-for-aws-appsync-apis/).

The configuration for custom domain can be found under the `appSync.domain` attribute.

## Quick start

```yaml
appSync:
  name: my-api
  domain:
    name: api.example.com
    hostedZoneId: Z111111QQQQQQQ
```

## Configuration

- `name`: Required. The fully qualified domain name to associate this API to.
- `certificateArn`: Optional. A valid certificate ARN for the domain name. See [Certificate](#certificate).
- `useCloudFormation`: Boolean. Optional. Whether to use CloudFormation or CLI commands to manage the domain. See [Using CloudFormation or CLI commands](#using-cloudformation-vs-the-cli-commands). Defaults to `true`.
- `retain`: Boolean, optional. Whether to retain the domain and domain association when they are removed from CloudFormation. Defaults to `false`. See [Ejecting from CloudFormation](#ejecting-from-cloudformation)
- `hostedZoneId`: Boolean, conditional. The Route53 hosted zone id where to create the certificate validation and/or AppSync Alias records. Required if `useCloudFormation` is `true` and `certificateArn` is not provided.
- `hostedZoneName`: The hosted zone name where to create the route53 Alias record. If `certificateArn` is provided, it takes precedence over `hostedZoneName`.
- `route53`: Boolean. Wether to create the Route53 Alias record for this domain. Set to `false` if you don't use Route53. Defaults to `true`.

## Certificate

If `useCloudFormation` is `true` and a valid `certificateArn` is not provided, a certificate will be created for the provided domain `name` using CloudFormation. You must provide the `hostedZoneId`
where the DNS validation records for the certificate will be created.

⚠️ Any change that requires a change of certificate attached to the domain requires a replacement of the AppSync domain resource. CloudFormation will usually fail with the following error when that happens:

```bash
CloudFormation cannot update a stack when a custom-named resource requires replacing. Rename api.example.com and update the stack again.
```

If `useCloudFormation` is `false`, when creating the domain with the `domain create` command, the Framework will try to find an existing certificate that
matches the given domain. If no valid certificate is found, an error will be thrown. No certificate will be auto-generated.

## Using CloudFormation vs the CLI commands

There are two ways to manage your custom domain:

- using CloudFormation (default)
- using the CLI [commands](commands.md#domain)

If `useCloudFormation` is set to `true`, the domain, domain association, and optionally, the domain certificate will be automatically created and managed by CloudFormation. However, in some cases you might not want that.

For example, if you want to use blue/green deployments, you might need to associate APIs from different stacks to the same domain. In that case, the only way to do it is to use the CLI.

For more information about managing domains with the CLI, see the [Commands](commands.md#domain) section.

## Ejecting from CloudFormation

If you started to manage your domain through CloudFormation and want to eject from it, follow the following steps:

1. Set `retain` to `true`

To avoid breaking your API if it is already on production, you first need to tell CloudFormation to retain the domain and any association with an existing API. For that, you can set the `retain` attribute to `true`. **You will then need to re-deploy to make sure that CloudFormation takes the change into account.**

2. Set `useCloudFormation` to `false`

You can now set `useCloudFormation` to `false` and **deploy one more time**. The domain and domain association resources will be removed from the CloudFormation template, but the resources will be retained (see point 1.)

3. Manage your domain using the CLI

You can now manage your domain using the CLI [commands](commands.md#domain)

## Domain names per stage

You can use different domains by stage easily thanks to [Serverless Framework Stage Parameters](https://www.serverless.com/framework/docs/guides/parameters)

```yaml
params:
  prod:
    domain: api.example.com
    domainCert: arn:aws:acm:us-east-1:123456789012:certificate/7e14a3b2-f7a5-4da5-8150-4a03ede7158c

  staging:
    domain: qa.example.com
    domainCert: arn:aws:acm:us-east-1:123456789012:certificate/61d7d798-d656-4630-9ff9-d77a7d616dbe

  default:
    domain: ${sls:stage}.example.com
    domainCert: arn:aws:acm:us-east-1:123456789012:certificate/44211071-e102-4bf4-b7b0-06d0b78cd667

appSync:
  name: my-api
  domain:
    name: ${param:domain}
    certificateArn: ${param:domainCert}
```
