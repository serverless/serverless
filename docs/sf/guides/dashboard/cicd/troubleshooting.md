<!--
title: Troubleshooting Dashboard CI/CD
description: Fix GitHub connection problems in Serverless Dashboard CI/CD, such as a missing repository, a revoked authorization or a removed GitHub App.
short_title: Troubleshooting
keywords:
  [
    'Serverless Framework',
    'Serverless Dashboard',
    'CI/CD',
    'Troubleshooting',
    'GitHub',
    'GitHub App',
    'OAuth',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/troubleshooting)

<!-- DOCS-SITE-LINK:END -->

# Troubleshooting Dashboard CI/CD

Serverless Dashboard CI/CD connects to GitHub in two parts: an OAuth authorization that lets the Dashboard act on your behalf, and the Serverless GitHub App, installed on the GitHub account or organization that owns your repositories. Most connection problems are fixed by resetting one of the two, as the following entries describe. The entries cover GitHub; Dashboard CI/CD also connects to Bitbucket repositories.

## `If you do not see your repository, install the Serverless application in Github`

The Dashboard shows this message below the **repository** dropdown in a service's CI/CD settings:

```text
If you do not see your repository, install the Serverless application in Github
```

**Cause:** the Serverless GitHub App isn't installed on the GitHub account or organization that owns the repository, or the app's repository access doesn't include the repository.

**Fix:**

1. Open the installed GitHub Apps of the account that owns the repository. For your personal account, go to [Installed GitHub Apps](https://github.com/settings/installations). For a GitHub organization, open the organization's **Settings** and, under **Third-party Access**, click **GitHub Apps**.
2. Click **Configure** next to the "Serverless" app, and under **Repository access** add the repository or select all repositories.
3. If the "Serverless" app isn't in the list, follow the "install the Serverless application" link in the message and install the app on the account that owns the repository.
4. Refresh the CI/CD settings page in the Dashboard.

## How do I reset the GitHub authorization for Dashboard CI/CD?

Reset the authorization when the Dashboard can no longer access GitHub on your behalf, for example after the authorization was revoked in GitHub.

1. Go to [Authorized GitHub Apps](https://github.com/settings/apps/authorizations) and click **Revoke** next to "Serverless". This revokes the keys the Dashboard uses to access GitHub on your behalf. Only the GitHub user who authorized the app can revoke the authorization.
2. Open the service's CI/CD settings, as in the "Connect to GitHub" steps of [Dashboard CI/CD](./README.md). The Dashboard prompts you to connect a GitHub repository; authenticate with GitHub again.
3. The Dashboard then shows the GitHub App install instructions. If the Serverless GitHub App is still installed, close that window without changing anything.
4. Refresh the CI/CD settings page.

## How do I reinstall the Serverless GitHub App?

Reinstall the app when its installation is missing or no longer matches the repositories you deploy, for example after it was uninstalled from an account or organization.

1. Open the installed GitHub Apps of the account that owns the repositories: [Installed GitHub Apps](https://github.com/settings/installations) for your personal account, or the organization's **Settings** > **Third-party Access** > **GitHub Apps** for a GitHub organization.
2. Click **Configure** next to the "Serverless" app and uninstall it.
3. Open the service's CI/CD settings, as in the "Connect to GitHub" steps of [Dashboard CI/CD](./README.md), and refresh the page.
4. Below the **repository** dropdown, follow the "install the Serverless application" link and install the app on the account or organization again, with access to the repositories you deploy.

GitHub's docs describe these settings in [Reviewing and modifying installed GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps) and [Reviewing and revoking authorization of GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps).

## Related pages

- [Dashboard CI/CD](./README.md): connect a repository and set up deployments.
- [Dashboard CI/CD FAQ](./faq.md): pricing, providers, runtimes and preview deployments.
