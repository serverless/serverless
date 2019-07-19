<!--
title: Serverless Framework - Google Cloud Functions Guide - Deploying
menuText: Deploying
menuOrder: 8
description: How to deploy your Google Cloud Functions functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Google - Deploying

The Serverless Framework was designed to provision your Google Cloud Functions Functions, Events and Resources safely and quickly.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy
```

Use this method when you have updated your Function, Events or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to the Google Cloud.

**Note:** You can specify a different configuration file name with the the `--config` option.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to a Google Deployment Manager configuration template.

- The provider plugin parses `serverless.yml` configuration and translates it to Google Cloud resources
- The code of your Functions is then packaged into a directory, zipped and uploaded to the deployment bucket
- Resources are deployed

### Tips

- Use this in your CI/CD systems, as it is the safest method of deployment.

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.

## Cloud Build

This method incorporates the above serverless deploy command into a Google Cloud Build process. This allows the serverless deploy to be automatically triggered from the code repository and executed within a container; avoiding the need to manually run the serverless deploy command locally.

### cloudbuild.yaml

The Cloud Build process relies on a cloudbuild.yaml file to define the build steps. Each build step is run in a Docker container. The following `cloudbuild.yaml` file provides a sample of how to run a serverless deploy in a container.

```yaml
steps:
  - name: 'gcr.io/cloud-builders/npm'
    id: 'Install node_modules based on package.json'
    args: ['install']
  # NOTE: npx is used as workaround to allow serverless command to be found
  # https://github.com/serverless/serverless/issues/4889
  - name: 'gcr.io/cloud-builders/npm'
    id: 'Install npx'
    args: ['install', '-g', 'npx']
  - name: 'gcr.io/cloud-builders/npm'
    id: 'Install Serverless framework using npm'
    args: ['install', '-g', 'serverless']
  - name: gcr.io/cloud-builders/gcloud
    args:
      - kms
      - decrypt
      - --ciphertext-file=mykeyfile.json.enc
      - --plaintext-file=mykeyfile.json
      - --location=global
      - --keyring=${_KEYRING}
      - --key=${_KEY}
  - name: 'gcr.io/cloud-builders/npm'
    id: 'Deploy serverless framework'
    entrypoint: bash
    args: ['-c', 'npx serverless deploy -v']
substitutions:
  _KEYRING: my_GCP_Keyring
  _KEY: my_GCP_Key
```

### Handling Credentials

The serverless framework requires credentials for executing the build (specified in the `serverless.yml` file). For the above code to work, the `serverless.yml` file was updated to include the following credentials path; since an absolute path is required.

```yaml
credentials: /workspace/mykeyfile.json
```

To secure the keyfile, the keyfile is encrypted using Google's Key Management System (KMS) in the console. You define a Keyring and Key that can be used for encryption and decryption. The Cloud Build service requires decrypt permissions for the KMS service. In the above example, the encrypted keyfile was included in the root project folder and named `mykeyfile.json.enc`. The Cloud Build process includes a step to decrypt this file (within the Docker instance) and save as `mykeyfile.json`. This is what is used by the serverless deploy process.

NOTE: The non-encrypted version can be excluded from your code repository by adding to the `.gitignore` file. The file should only be used locally to generate the encrypted version.

### Cloud Build Costs

Google offers a daily free tier, which means many Cloud Build processes can run for free if the required build minutes are within the allotted minutes. Running beyond the allotted minutes may incur costs. For complete pricing check out the [pricing documentation](https://cloud.google.com/cloud-build/pricing).
