<!--
title: Serverless Framework Commands - AWS Lambda - Serverless Stats
menuText: serverless stats
menuOrder: 23
description: Enables or disables Serverless Statistic logging within the Serverless Framework.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/slstats)

<!-- DOCS-SITE-LINK:END -->

# Serverless Statistics and Usage Tracking

The Serverless Framework development is driven by usage and demand of our community. We understand what users are doing by collecting various events and usage data, and we use this data to iterate and improve Serverless based on this gained insight. This includes things like providers, runtimes, event types, function memory size and timeout, plugins installed, and a bit about the environment of the CLI like operating systems, within a CI system or docker container, node.js version, etc. If you'd prefer, you can [disable usage tracking](#disable-statistics-and-usage-tracking).

We do not use event payloads to collect any identifying information, and the data is used in aggregate to understand the community as a whole. The one exception is if you are logged in to the Serverless Dashboard we collect information about your logged in user such as your `userId`, more information can be found in the [signed in to platform section](#signed-in-to-the-platform).

## Disable Statistics and Usage Tracking

The `slstats` plugin offers functionality to globally disable tracking via a property `trackingDisabled` in `~/.serverlessrc`. This file is automatically created when you install the framework.

`serverless slstats --disable` to disable usage tracking  
`serverless slstats --enable` to enable usage tracking

While the command does need to be run from within a serverless project directory, it is a global configuration that only need be run a single time for your CLI user environment.

Once disabled, usage events will no longer be sent from any of your serverless CLI usage. While the command does need to be run from within a serverless project directory, it is a global configuration.

## Events We Collect

The following is a list of the events that we collect:

- framework:service_created
- framework:service_deployed
- framework:service_published
- framework:service_infoViewed
- framework:service_invoked
- framework:service_removed
- framework:service_pluginListed
- framework:service_logsViewed
- framework:service_logsTailed
- framework:service_metricsViewed
- framework:service_pluginsSearched
- service_pluginInstalled
- service_pluginUninstalled
- service_installed
- user_awsCredentialsConfigured
- user_enabledTracking
- user_disabledTracking
- user_loggedIn
- user_loggedOut

## Signed in to the Dashboard

If you are signed in to the [Serverless Dashboard](https://app.serverless.com), we do receive your userId as part of the event payloads. We can use this information to understand your org and users interactions with the CLI and building services.

If you are not signed in, we do not send any identifying information, such as an userId, within any of the event payloads.
