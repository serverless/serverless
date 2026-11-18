<!--
title: Run Tests in Serverless CI/CD
description: 'Run a service''s Node.js or Python tests before every Serverless CI/CD deploy: the test command, the package.json test script and Python dependencies.'
short_title: Run Tests
keywords:
  [
    'Serverless Framework',
    'Serverless CI/CD',
    'npm test',
    'pytest',
    'Node.js tests',
    'Python tests',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/dashboard/cicd/running-tests)

<!-- DOCS-SITE-LINK:END -->

# Run tests in Serverless CI/CD

Every [Serverless CI/CD](./README.md) build runs a test step after it installs dependencies and before it deploys. The test step runs the test command configured in the service's CI/CD settings, `npm test` by default. When the command exits with a code other than `0`, the build stops and the service is not deployed.

## Add a test script for Node.js

With the default `npm test` command, the test step runs the `test` script of the `package.json` in the service directory. For a Node.js service, point it at your test runner:

```json
{
  "name": "my-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

The build installs the packages listed in `package.json` with npm before the test step, so a test runner such as `mocha` or `vitest` listed there is available to the script.

The test step is skipped when `package.json` has no `test` script, and when the script is the placeholder that `npm init` writes (`echo "Error: no test specified" && exit 1`).

## Run Python tests

For a Python service, add a `package.json` next to `serverless.yml` whose `test` script runs your Python tests. The build's install step runs npm, not pip, so install the Python requirements in a `postinstall` script, which npm runs at the end of the install step:

```json
{
  "name": "my-python-service",
  "version": "1.0.0",
  "scripts": {
    "postinstall": "pip3 install -r requirements.txt",
    "test": "pytest"
  }
}
```

List `pytest` in `requirements.txt`, or install it in the same `postinstall` script.

These installed packages exist only in the build environment. The Framework's built-in [Python Support](../../../providers/aws/guide/python.md) bundles the packages from `requirements.txt` into the deployment package when `custom.pythonRequirements` is set in `serverless.yml`.

## Change the test command

To run something other than `npm test`, set the test command in the service's CI/CD settings. npm runs the `pretest` and `posttest` scripts only for `npm test` or `npm run test`; another command, such as `npm run test:unit` or `npx vitest`, runs without them ([Custom scripts](./custom-scripts.md)).

## Related

- [Custom scripts](./custom-scripts.md): run commands before or after install, test and deploy.
- [Private packages](./private-packages.md): install test dependencies from a private npm registry.
- [Serverless CI/CD](./README.md): what each build runs.
