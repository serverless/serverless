<!--
title: AppSync Custom Domain
description: Give an AppSync GraphQL API a custom domain name from serverless.yml, with the certificate and Route 53 record managed by CloudFormation or the CLI.
short_title: AppSync Custom Domain
keywords:
  [
    'Serverless Framework',
    'AppSync custom domain',
    'AppSync domain name',
    'AppSync ACM certificate',
    'AppSync Route 53',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/appsync/custom-domain)

<!-- DOCS-SITE-LINK:END -->

# AppSync custom domain

The `appSync.domain` block gives an AppSync API a [custom domain name](https://docs.aws.amazon.com/appsync/latest/devguide/custom-domain-name.html), such as `api.example.com`, for both its GraphQL and real-time endpoints. By default the Framework manages the domain in the service's CloudFormation stack: the AppSync domain, its association with the API, an ACM certificate and a Route 53 alias record. To move a domain between APIs or stacks, for example for blue/green deployments, manage it with [CLI commands](#manage-the-domain-with-cli-commands) instead.

This configuration uses an existing certificate and creates the domain and its Route 53 record:

```yaml
appSync:
  name: blog-api
  domain:
    name: api.example.com
    certificateArn: arn:aws:acm:us-east-1:123456789012:certificate/a1b2c3d4-5678-90ab-cdef-EXAMPLE11111
    hostedZoneId: Z111111QQQQQQQ
```

AppSync requires the ACM certificate to be in `us-east-1`, whatever Region the API is in. After the deploy, the endpoints on the custom domain appear in the deploy and `serverless info` output alongside the AppSync ones:

```text
appsync endpoints:
  graphql: https://abcdefghijklmnopqrstuvwxyz.appsync-api.eu-west-1.amazonaws.com/graphql
  graphql: https://api.example.com/graphql
  realtime: wss://abcdefghijklmnopqrstuvwxyz.appsync-realtime-api.eu-west-1.amazonaws.com/graphql
  realtime: wss://api.example.com/graphql/realtime
```

## Custom domain keys

| Key                 | Type                | Default                                    | Description                                                                                                                                               |
| ------------------- | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`              | string              | Required                                   | The fully qualified domain name, in lowercase, such as `api.example.com`.                                                                                 |
| `certificateArn`    | string or intrinsic | A certificate the Framework creates        | The ARN of an ACM certificate in `us-east-1` that covers `name`. See [Domain certificate](#domain-certificate).                                           |
| `hostedZoneId`      | string or intrinsic | None                                       | The Route 53 hosted zone for the certificate's DNS validation records and the alias record. Required with CloudFormation when `certificateArn` isn't set. |
| `hostedZoneName`    | string              | `name` without its first label, plus a dot | The hosted zone for the alias record, by name with a trailing dot (`example.com.`). Ignored when `hostedZoneId` is set.                                   |
| `route53`           | boolean             | `true`                                     | Creates a Route 53 `A` alias record for `name`. Set to `false` when the domain's DNS isn't in Route 53, and create the record yourself.                   |
| `useCloudFormation` | boolean             | `true`                                     | Manages the domain in the CloudFormation stack. Set to `false` to manage it with the CLI commands.                                                        |
| `retain`            | boolean             | `false`                                    | Keeps the domain, association, certificate and record when they leave the CloudFormation template or the stack is removed.                                |
| `enabled`           | boolean             | `true`                                     | Set to `false` to skip the domain while keeping the block.                                                                                                |

With `useCloudFormation` left at `true`, set `certificateArn` or `hostedZoneId`; otherwise the `appSync` validation reports `when using CloudFormation, you must provide either certificateArn or hostedZoneId.`

## Domain certificate

When `certificateArn` isn't set, the Framework creates an ACM certificate for `name`, validated by DNS records in `hostedZoneId`:

```yaml
provider:
  name: aws
  region: us-east-1

appSync:
  name: blog-api
  domain:
    name: api.example.com
    hostedZoneId: Z111111QQQQQQQ
```

The Framework creates the certificate in the Region the service deploys to, so this works only for services deployed to `us-east-1`. For services in other Regions, create the certificate in `us-east-1` and set `certificateArn`.

A change that needs a different certificate replaces the AppSync domain resource, and CloudFormation can't replace a custom-named resource in place. The deploy then stops with:

```text
CloudFormation cannot update a stack when a custom-named resource requires replacing. Rename api.example.com and update the stack again.
```

To switch certificates, deploy with a different domain `name`, or remove the domain and deploy again.

## Manage the domain with CLI commands

With `useCloudFormation: false`, the Framework leaves the domain out of the stack, and the [`serverless appsync domain` commands](./commands.md#manage-the-custom-domain) create and associate it. Use this when several APIs take turns on one domain, such as blue/green deployments from different stages or stacks: associating the domain with one API detaches it from the other.

```yaml
appSync:
  name: blog-api
  domain:
    name: api.example.com
    useCloudFormation: false
```

Then create the domain, associate it with this stage's API and create the Route 53 record:

```bash
serverless appsync domain create --stage prod
serverless appsync domain assoc --stage prod
serverless appsync domain create-record --stage prod
```

`domain create` looks for an issued ACM certificate in `us-east-1` for exactly `name`, then for its wildcard (`*.example.com`), unless `certificateArn` is set. It doesn't create a certificate.

## Eject the domain from CloudFormation

To move a domain that CloudFormation manages to the CLI commands without taking it offline:

1. Set `retain: true` and deploy. CloudFormation now keeps the domain, association, certificate and record when they leave the template.
2. Set `useCloudFormation: false` and deploy again. The resources leave the stack and stay in your account.
3. Manage the domain with the [CLI commands](./commands.md#manage-the-custom-domain).

## Domain names per stage

To use a different domain in each stage, set the domain and certificate as [stage parameters](../../../../guides/parameters.md):

```yaml
params:
  prod:
    domain: api.example.com
    domainCert: arn:aws:acm:us-east-1:123456789012:certificate/a1b2c3d4-5678-90ab-cdef-EXAMPLE11111
  staging:
    domain: qa.example.com
    domainCert: arn:aws:acm:us-east-1:123456789012:certificate/a1b2c3d4-5678-90ab-cdef-EXAMPLE22222
  default:
    domain: ${sls:stage}.example.com
    domainCert: arn:aws:acm:us-east-1:123456789012:certificate/a1b2c3d4-5678-90ab-cdef-EXAMPLE33333

appSync:
  name: blog-api
  domain:
    name: ${param:domain}
    certificateArn: ${param:domainCert}
```

## Related pages

- [AppSync CLI commands](./commands.md#manage-the-custom-domain)
- [Stage parameters](../../../../guides/parameters.md)
- [Configuring custom domain names in AWS AppSync](https://docs.aws.amazon.com/appsync/latest/devguide/custom-domain-name.html)
