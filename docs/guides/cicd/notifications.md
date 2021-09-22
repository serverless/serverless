<!--
title: Serverless Dashboard - CI/CD Notifications
menuText: Notifications
menuOrder: 6
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/notifications/)

<!-- DOCS-SITE-LINK:END -->

# Notifications

Serverless Framework has integrated Slack, email, SNS and webhook notifications for CI/CD status updates.

Notifications for CI/CD events are not setup by default, so you will not get notified of deployments starting,
completing of failing. These notifications must be added manually.

Notifications for CI/CD events are configured the same way as they are for [monitoring](/framework/docs/dashboard/monitoring/notifications/).

You can subscribe to three different CI/CD events in the "Add notifications" dialog:

- deployment started
- deployment succeeded
- deployment failed

These three events apply to both branch deployments and preview deployments.
