# Serverless Framework Dashboard Plugin

[![Build Status](https://github.com/serverless/dashboard-plugin/workflows/Integrate/badge.svg)](https://github.com/serverless/dashboard-plugin/actions?query=workflow%3AIntegrate)
[![npm version](https://img.shields.io/npm/v/@serverless/dashboard-plugin.svg)](https://badge.fury.io/js/@serverless/dashboard-plugin)
[![codecov](https://codecov.io/gh/serverless/dashboard-plugin/branch/main/graph/badge.svg)](https://codecov.io/gh/serverless/dashboard-plugin)

To enable the various features of the [Serverless Framework Dashboard](https://app.serverless.com) for a particular Service you must deploy or redeploy that Service, using Serverless Framework open-source CLI version 1.45.1 or later.

Upon deployment, the Serverless Framwork Enteprise Plugin will automatically wrap and instrument your functions to work with the Serverless Framework Dashboard dashboard.

## Dev notes

### Install dependencies and build SDK JS

```
npm i
cd sdk-js
npm i
npm run build
cd -
```

### Test

```
npm t
cd sdk-js
npm t
cd -
```

#### Integration tests

For integration tests run you need an access to `integration` dashboard organization, and generated for it access key.

Then tests can be run as:

```
SERVERLESS_ACCESS_KEY=xxx npm run integration-test
```

### Release process

- Create a PR updating version in `package.json`
- Create a draft release on github with a change log
- Have it approved & merge (Release is automatically published via CI)
