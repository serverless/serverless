<!--
title: Private Packages in Dashboard CI/CD
description: Install private npm packages or packages from a private Python index in Serverless Dashboard CI/CD, with the token stored as a Dashboard parameter.
short_title: Private Packages
keywords:
  [
    'Serverless Framework',
    'Serverless Dashboard',
    'CI/CD',
    'Private packages',
    'npm token',
    'NPM_TOKEN',
    'Private PyPI index',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/private-packages)

<!-- DOCS-SITE-LINK:END -->

# Private packages in Dashboard CI/CD

When a service depends on packages from a private npm registry or a private Python package index, the Serverless Dashboard CI/CD build needs a token to install them. Store the token as a Dashboard parameter: Dashboard CI/CD loads the service's parameters as environment variables, and the package manager reads the token from there.

For npm, create a Dashboard parameter named `NPM_TOKEN` that holds the token, and check in this `.npmrc` file next to the service's `package.json`:

```text
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

The file contains the literal text `${NPM_TOKEN}`; npm replaces it with the value of the `NPM_TOKEN` environment variable. Never put the token itself in the file or anywhere else in the repository.

## Install private npm packages

Prerequisites: an account on the registry with read access to the private packages, and the service connected to Dashboard CI/CD ([Dashboard CI/CD](./README.md)).

1. Create an access token for the build on the registry that hosts the packages. On the public npm registry, a read-only granular access token is enough to install packages; see [Creating and viewing access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens) in the npm docs. GitHub Packages accepts a personal access token (classic) with at least the `read:packages` scope.
2. In the [Dashboard](https://app.serverless.com), create a parameter named `NPM_TOKEN` with the token as its value. Create it on the service to use it for every stage, or on an instance to use it only for that instance's stage and Region. [Creating Serverless Dashboard parameters](../../parameters.md#creating-serverless-dashboard-parameters) shows where.
3. In the service's directory, next to `package.json`, create the `.npmrc` file shown at the top of this page. For a registry other than the public npm registry, replace `registry.npmjs.org` with that registry's host and add a line that maps the packages' scope to the registry; without it, npm requests the packages from the registry in its `registry` setting, the public npm registry by default. For GitHub Packages, `.npmrc` contains:

   ```text
   @NAMESPACE:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NPM_TOKEN}
   ```

   Replace `NAMESPACE` with the scope of the packages, the GitHub user or organization that owns them. See [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) in the GitHub docs.

4. Commit and push `.npmrc`.

The next Dashboard CI/CD deployment installs the private packages with the token. npm's guide [Using private packages in a CI/CD workflow](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow) describes the same setup for any CI system.

## Install packages from a private Python index

pip reads each of its options from a `PIP_<OPTION>` environment variable ([pip environment variables](https://pip.pypa.io/en/stable/topics/configuration/#environment-variables)), so a Dashboard parameter can point pip at a private index:

1. In the [Dashboard](https://app.serverless.com), create a parameter named `PIP_EXTRA_INDEX_URL` with your index URL as its value, for example `https://USERNAME:TOKEN@pypi.example.com/simple/`. Replace `USERNAME`, `TOKEN` and the host with your index's values, and percent-encode any special characters in them (`/` as `%2F`, `@` as `%40`); see [pip authentication](https://pip.pypa.io/en/stable/topics/authentication/). To replace PyPI instead of adding an index, name the parameter `PIP_INDEX_URL`.

   **Warning:** With `PIP_EXTRA_INDEX_URL`, pip searches PyPI and your index with no priority and installs the highest matching version ([`--extra-index-url`](https://pip.pypa.io/en/stable/cli/pip_install/#cmdoption-extra-index-url)). A package published on PyPI under the name of one of your private packages, with a higher version, is installed and run in the build instead. To rule this out, use `PIP_INDEX_URL` with an index that serves your private packages and proxies the public packages you approve, or pin every requirement with a hash ([Secure installs](https://pip.pypa.io/en/stable/topics/secure-installs/)).

2. When `dockerizePip` runs pip in Docker (`true`, or `non-linux` on a build machine that isn't Linux), pass the variable into the container. In `serverless.yml`, under `custom.pythonRequirements`, add:

   ```yaml
   custom:
     pythonRequirements:
       dockerizePip: true
       dockerEnv:
         - PIP_EXTRA_INDEX_URL
   ```

   List the name of the parameter you created in step 1: `PIP_INDEX_URL` instead of `PIP_EXTRA_INDEX_URL` when you replaced PyPI.

   When pip doesn't run in Docker, the Framework's Python requirements packaging runs the installer with the build's environment variables, and no `dockerEnv` entry is needed.

With `custom.pythonRequirements.installer: uv`, the installer is uv, which reads its own index variables (`UV_INDEX`, `UV_DEFAULT_INDEX`) instead of the `PIP_*` ones; see [uv environment variables](https://docs.astral.sh/uv/reference/environment/). [Python support](../../../providers/aws/guide/python.md) covers the other `pythonRequirements` options.

## How Dashboard parameters reach the build

Dashboard CI/CD loads the parameters of the service and of the instance it deploys (the service in the target stage and Region) as environment variables of the build. When the service and the instance both have a parameter with the same name, the instance's value is used.

The same parameters can also be referenced in `serverless.yml` as `${param:<name>}` variables. A token that only the install step needs doesn't belong in `provider.environment` or a function's `environment`, which deploy the value to your Lambda functions.

## Related pages

- [Serverless Dashboard parameters](../../parameters.md#serverless-dashboard-parameters): create parameters and how `${param:...}` resolves them.
- [Running tests](./running-tests.md): how Dashboard CI/CD installs dependencies and runs tests.
- [Dashboard CI/CD best practices](./best-practices.md): keep secrets in parameters, and other practices.
