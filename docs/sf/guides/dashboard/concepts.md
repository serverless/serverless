<!--
title: Dashboard Orgs, Apps and Members
description: What orgs, apps, services, instances and member roles are in the Serverless Framework Dashboard, and how serverless.yml and the CLI select them.
short_title: Orgs and Apps
keywords: ['Serverless Framework', 'Dashboard', 'Orgs', 'Apps', 'Instances', 'Members']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/concepts)

<!-- DOCS-SITE-LINK:END -->

# Dashboard orgs, apps and members

The Serverless Framework Dashboard organizes your work in orgs, apps, services and instances, and gives each person in an org a member role. In `serverless.yml`, the top-level `org` and `app` properties place a service in this hierarchy:

```yaml
# serverless.yml
org: myorg
app: my-app
service: my-service
```

## Org

An org is a tenant in the Dashboard: it owns apps, services, parameters, providers and AWS account integrations, and has members. A member can belong to several orgs.

The `org` property in `serverless.yml` names the org: lowercase letters and digits, 2 to 39 characters. To pick the org it signs in to, the CLI uses the first of these that is set:

1. The `--org` option.
2. The `org` property in `serverless.yml`.
3. The `SERVERLESS_ORG_NAME` environment variable.
4. The org of a [Serverless Compose](../compose.md) project, when the service is deployed with Compose.
5. The default org saved in `~/.serverlessrc` when you sign in with `serverless login`.

An Access Key in `SERVERLESS_ACCESS_KEY` belongs to one org, and the CLI signs in to that org. When none of the first four sources names an org, the CLI uses the key's org. When one of them names a different org, the command stops with `The provided Access Key is not for the Org "myorg". Please provide an Access Key for the "myorg" Org.` After `serverless login`, without `SERVERLESS_ACCESS_KEY`, the CLI signs in to the selected org with the Access Key saved for that org in `~/.serverlessrc`, and creates and saves one when there is none; if you aren't a member of the org, creating the key stops the command with an error that starts with `You are not a member of the Org "myorg".` Deployment records and `${output:...}` variables use the `org` in `serverless.yml`.

## App

An app groups related services in an org. Setting the `app` property in `serverless.yml` turns on Dashboard features for the service: deployment records, Dashboard parameters, outputs and observability. The `app` value uses lowercase letters, digits and single hyphens, 2 to 39 characters, and doesn't start or end with a hyphen. The `--app` option replaces it when the CLI signs in; deployment records and `${output:...}` variables use the `app` in `serverless.yml`.

## Service

A service is one `serverless.yml`, named by its `service` property. In the Dashboard it appears under its app.

## Instance

An instance is one deployment of a service to a stage and a Region, for example `my-service` in stage `prod` in `us-east-1`. The Dashboard keeps deployment records and [outputs](./output-variables.md) per instance, and [Dashboard parameters](../parameters.md#serverless-dashboard-parameters) can be set per service or per instance.

## Member roles

Each member of an org has one of two roles:

- **Owner**: manages the org's members and settings.
- **Contributor**: uses the org's apps, services and features, without managing members or org settings.

## Related pages

- [Dashboard overview and setup](./README.md)
- [Dashboard outputs](./output-variables.md)
- [serverless login](../../providers/aws/cli-reference/login.md)
