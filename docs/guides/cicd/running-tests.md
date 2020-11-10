<!--
title: Serverless Dashboard - Running tests
menuText: Testing
menuOrder: 4
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/running-tests/)

<!-- DOCS-SITE-LINK:END -->

# Running Tests

The Serverless Framework will automatically run tests for each deployment by running `npm test`. The tests must pass, return `0`, before the service is deployed. If the tests fail, then the service will not be deployed.

The tests only run if a `test` script is present in the `package.json` file, like in the example below:

```json
{
  "name": "my-serverless-project",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "",
  "license": "ISC"
}
```

The tests will be skipped if the `npm test` command returns `Error: no test specified`. This is the response from `npm` if no `test` script is defined. It is also the default value of the `test` script when you initialize a new package.json via `npm init`.

## Running Node tests

If you are using Node for your runtime, then all the dependencies will automatically be installed using `npm install` before tests are run.

Update the `tests` script to run your node test suite (e.g. `mocha`).

## Running Python tests

If you are using Python we recommend using the [serverless-python-requirements](https://github.com/UnitedIncome/serverless-python-requirements) plugin to install the dependencies from `requirements.txt`.

If you are not using the serverless-python-requirements plugin, then you can install the requirements by adding the `postinstall` script to `package.json`.

```json
{
  "name": "demo-python",
  "version": "1.0.0",
  "scripts": {
    "postinstall": "pip3 install -r requirements.txt",
    "test": "pytest"
  },
  "devDependencies": {
    "serverless-python-requirements": "^5.0.1"
  }
}
```

You must update the `test` script in `package.json` to run your Python tests suite (e.g. `pytest`).
