<!--
title: Dashboard CI/CD for Mono-Repos
description: Deploy only the services whose files changed in a mono-repo, using base directories and trigger directories in Serverless Dashboard CI/CD.
short_title: Mono-Repos
keywords:
  [
    'Serverless Framework',
    'Serverless Dashboard',
    'CI/CD',
    'Mono Repos',
    'Trigger Directories',
    'Base Directory',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/mono-repo)

<!-- DOCS-SITE-LINK:END -->

# Dashboard CI/CD for mono-repos

A mono-repo keeps several services in one GitHub or Bitbucket repository, each with its own `serverless.yml` in its own directory, often next to a directory of shared code. Trigger directories in Serverless Dashboard CI/CD decide which commits deploy a service, so a commit deploys only the services whose files, or whose shared code, changed.

This page uses a repository with two services and one shared directory:

```text
my-repo/
├── service1/
│   └── serverless.yml
├── service2/
│   └── serverless.yml
└── shared/
```

With trigger directories set as in [Configure trigger directories](#configure-trigger-directories), commits deploy these services:

| A commit changes files in | Deployed services         |
| ------------------------- | ------------------------- |
| `service1/`               | `service1`                |
| `service2/`               | `service2`                |
| `shared/`                 | `service1` and `service2` |

## Prerequisites

- Each service is connected to the repository in its Dashboard CI/CD settings, with its directory (`service1`, `service2`) as the base directory and a branch deployment set up. [Dashboard CI/CD](./README.md) shows how.
- The `service` value in each directory's `serverless.yml` matches the Dashboard service you configure.

## Configure trigger directories

Trigger directories are set per service, in the **Trigger Directories** section of the service's CI/CD settings. For `service1`:

1. Open the CI/CD settings of `service1` in the [Dashboard](https://app.serverless.com).
2. In **Trigger Directories**, clear **Always trigger a deployment**. The service's base directory, `service1`, is added as a trigger directory.
3. Add `./shared` as a trigger directory.

Repeat the steps for `service2`. Its base directory, `service2`, is added in step 2.

To verify the setup, push a commit that changes only a file in `service2/` to a branch with a branch deployment. The **Deployments** view in the Dashboard lists a new deployment for `service2` and none for `service1`.

## How trigger directories select deployments

The **Always trigger a deployment** option in a service's Trigger Directories settings decides how commits start deployments of that service:

- **Selected** (the default): every commit to a branch the service deploys from starts a deployment, whichever files the commit changed. In a mono-repo, every service redeploys on every commit.
- **Cleared**: a commit starts a deployment only when it changes at least one file inside one of the service's trigger directories. A commit that changes files only in other directories doesn't deploy the service.

Trigger directories only decide whether a commit starts a deployment. The deployment itself runs the service from its base directory.

## Related pages

- [Dashboard CI/CD](./README.md): connect a repository and choose a base directory.
- [Branch deployments](./branch-deployments.md): map branches to stages.
- [Dashboard CI/CD best practices](./best-practices.md): organize services, accounts and secrets.
