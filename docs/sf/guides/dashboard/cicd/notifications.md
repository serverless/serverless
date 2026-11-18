<!--
title: Dashboard CI/CD Notifications
description: Get Slack, email, SNS or webhook notifications when a Serverless Dashboard CI/CD deployment starts, succeeds or fails.
short_title: Notifications
keywords:
  [
    'Serverless Framework',
    'Serverless Dashboard',
    'CI/CD',
    'Notifications',
    'Slack',
    'Email',
    'SNS',
    'Webhook',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/notifications)

<!-- DOCS-SITE-LINK:END -->

# Dashboard CI/CD notifications

Serverless Dashboard CI/CD sends a notification to Slack, email, an Amazon SNS topic or a webhook when a deployment starts, succeeds or fails. Use notifications to learn about CI/CD deployments without watching the Dashboard, for example to alert a team channel when a deployment fails.

No CI/CD notifications are set up by default. To add one, open the **Add notifications** dialog in the [Dashboard](https://app.serverless.com), choose the channel, and subscribe it to one or more of the CI/CD events in the following table.

## CI/CD notification events

Dashboard CI/CD offers three events. Each one covers both [branch deployments](./branch-deployments.md) and [preview deployments](./preview-deployments.md):

| Event                | Sent when                                  |
| -------------------- | ------------------------------------------ |
| deployment started   | A CI/CD deployment starts.                 |
| deployment succeeded | A CI/CD deployment completes successfully. |
| deployment failed    | A CI/CD deployment ends with a failure.    |

## CI/CD notification channels

A CI/CD notification goes to one of these channels:

- Slack
- Email
- Amazon SNS topic
- Webhook

## Related pages

- [Dashboard CI/CD](./README.md): connect a repository and set up deployments.
- [Dashboard CI/CD best practices](./best-practices.md): notify the team about failed deployments, and other practices.
- [Troubleshooting Dashboard CI/CD](./troubleshooting.md): reconnect GitHub when repositories are missing.
