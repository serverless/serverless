# Serverless - Google Node.js Typescript

This project has been generated using the `google-nodejs-typescript` template from the [Serverless framework](https://www.serverless.com/).

For detailed instructions, please refer to the [documentation](https://www.serverless.com/framework/docs/providers/google/).

## Installation/deployment instructions

Depending on your preferred package manager, follow the instructions below to deploy your project.

> **Requirements**: NodeJS `lts/fermium (v.14.15.0)`. If you're using [nvm](https://github.com/nvm-sh/nvm), run `nvm use` to ensure you're using the same Node version in local and in your cloud function's runtime.

### Setup your google project

1. Go to the [API dashboard](https://console.cloud.google.com/apis/dashboard), select your project and enable the following APIs (if not already enabled):

   - Cloud Functions API
   - Cloud Deployment Manager V2 API
   - Cloud Build API
   - Cloud Storage
   - Cloud Logging API

2. Replace `<your-gcp-project-id>` with your project id in `serverles.ts`

### Authenticate

Follow [the authentication doc](https://www.serverless.com/framework/docs/providers/google/guide/credentials/).

**TL;DR**

```shell
gcloud auth application-default login
```

### Install the dependencies

```shell
# with npm
npm i
# or yarn
yarn
```

### Deploy

```shell
# with npm
npm run deploy
# or yarn
yarn deploy
```
