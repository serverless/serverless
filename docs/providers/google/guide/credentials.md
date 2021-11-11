<!--
title: Serverless Framework - Google Cloud Functions Guide - Credentials
menuText: Credentials
menuOrder: 3
description: How to set up the Serverless Framework with your Google Cloud Functions credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# Google - Credentials

The Serverless Framework needs access to account credentials for your Google Cloud account so that it can create and manage resources on your behalf.

## Create a Google Cloud Billing Account

You need a Billing Account with a credit card attached to use Google Cloud Functions. Here's how to create one:

1. <a href="https://console.cloud.google.com/billing/create" target="_blank">Click here</a>, to go to the screen to create a new Billing Account.
2. Enter the name of the Billing Account and enter your billing information. Then click Submit to enable billing.
3. A Billing Account will exist already offering you a free trial. Please note that this will not work for Google Cloud Functions. Only a Billing Account with a valid credit card will work.

If necessary, a more detailed guide on creating a Billing Account can be found <a href="https://support.google.com/cloud/answer/6288653?hl=en" target="_blank">here</a>.

## Create a new Google Cloud Project

A Google Cloud Project is required to use Google Cloud Functions. Here's how to create one:

1. Go to the <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a>.
2. There is a dropdown near the top left of the screen (near the search bar that lists your projects). Click it and select "Create Project".
3. Enter a Project name and select the Billing Account you created in the steps above (or any Billing Account with a valid credit card attached).
4. Click on "Create" to start the creation process.
5. Wait until the Project was successfully created and Google will redirect you to your new Project.
6. Verify you're currently within your new Project by looking at the dropdown next to the search bar. This should mark your new Project as selected.

## Enable the necessary APIs

You need to enable the following APIs so that Serverless can create the corresponding resources.

Go to the <a href="https://console.cloud.google.com/apis/dashboard" target="_blank">API dashboard</a>, select your project and enable the following APIs (if not already enabled):

- Cloud Functions API
- Cloud Deployment Manager V2 API
- Cloud Build API
- Cloud Storage
- Cloud Logging API

## Set up a user & assign roles

You can either use a **Service Account** or directly your **Google Account**
with appropriate roles that Serverless can use to create resources in your project.

### Google Account

(<a href="https://cloud.google.com/iam/docs/overview#google_account" target="_blank">Google Accounts</a> are real users who can be authenticated by the Google SSO)

This method is the most convenient to allow developers to develop and deploy a Serverless application locally.

If you are owner of the project you have nothing to do.
Otherwise, make sure your user has at least the following roles:

- `Deployment Manager Editor`
- `Storage Admin`
- `Logging Admin`
- `Cloud Functions Developer`

### Service Account

(<a href="https://cloud.google.com/iam/docs/overview#service_account" target="_blank">Service accounts</a> are accounts for applications instead of individuals end users)

This method is useful for to authenticate a CI/CD or to assume a specific role without changing the roles of a **Google Account**.

Create a **Service Account** with at least the following roles:

- `Deployment Manager Editor`
- `Storage Admin`
- `Logging Admin`
- `Cloud Functions Developer`

How to create a **Service Account**:

1. Go to the <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a>.
2. Choose the project that you are working on from the top drop down
3. Click `IAM & admin` menu on left-sidebar
4. Then click `Service accounts` on left-sidebar
5. Click `CREATE SERVICE ACCOUNT` button on the top
6. Input Service account name and Service account ID will be generated automatically for you. Change it if you wish to.
7. Click `Create` button
8. Add `Deployment Manager Editor`, `Storage Admin`, `Logging Admin`, `Cloud Functions Developer` roles
9. Click `Done` button

## Authenticate

The Serverless Google Cloud plugin supports several authentication methods.

### Application Default Credentials

The plugin will let Google find the **Application Default Credentials** and implicitly authenticate.

To authenticate with a **Google Account** use <a href="https://cloud.google.com/sdk/gcloud/reference/auth/application-default/login" target="_blank">gcloud cli login</a>

```shell
gcloud auth application-default login
```

To authenticate with a **Service Account**:

1. Go on the Service Account panel of `IAM & admin`
2. Select a Service Account and click on `manage keys`
3. Create a JSON credentials keyfile
4. Download and store the keyfile
5. expose the absolute path of the keyfile in the environment variable `GOOGLE_APPLICATION_CREDENTIALS`

### Explicitly provide the path of a credentials keyfile

1. Get a credentials keyfile as explained above.
2. In the `provider` config in `serverless.yml`, add a `credentials` attribute with the absolute path of the credentials keyfile:

```yml
provider:
  name: google
  runtime: nodejs
  project: my-serverless-project-1234

  credentials: ~/.gcloud/keyfile.json # <- the path must be absolute
```

If `provider.credentials` is provided in the `serverless.yml`, the **Application Default Credentials** will be ignored.
