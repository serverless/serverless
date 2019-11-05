<!--
title: Tencent Cloud - Serverless Cloud Function (SCF) Guide - Credentials | Serverless Framework
menuText: Credentials
menuOrder: 3
description: How to set up the Serverless Framework with your Tencent Cloud credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/guide/credentials/)

<!-- DOCS-SITE-LINK:END -->

# Tencent Cloud - Credentials

The Serverless Framework needs access to account credentials for your Tencent Cloud account so that it can create and manage resources on your behalf.

## Create a Tencent Cloud Account

If you already have a Tencent Cloud account, skip to the next step to [create an CAM User and Access Key](#create-an-cam-user-and-access-key)

To create a Tencent Cloud account:

1. Open https://cloud.tencent.com/, and then choose Sign up.
2. Follow the online instructions.

- Part of the sign-up procedure involves entering a PIN using the phone keypad.

## Create an IAM User and Access Key

Services in Tencent Cloud, such as SCF, require that you provide credentials when you access them to ensure that you have permission to access the resources owned by that service. To accomplish this Tencent Cloud recommends that you use Cloud Access Management (CAM).

You need to create credentials Serverless can use to create resources in your Project.

1. Login to your account and go to the [Cloud Access Management (CAM) page](https://console.cloud.tencent.com/cam/capi).
2. Click on **Access Key** and then **Create Key**.
3. View and copy the **APPID**, **SecretId** & **SecretKey** to a temporary place. (To get the SecretKey, you may need to enter a PIN using the phone keypad.)
4. Create a file named `credentials` containing the credentials that you have collected.

```ini
[default]
tencent_appid = 1251000000
tencent_secret_id = AKIDteBxxxxxxxxxxnZfk
tencent_secret_key = AKID2qsxxxxxxxxxxxxxtTo
```

Save the credentials file to a folder like`~/.tencent/credentials`. Copy the path of the file you saved.

## Update `serverless.yml` (optional)

Open up your `serverless.yml` file and update the `provider` section with
the path to your credentials file (this path needs to be absolute). It should look something like this:

```yml
provider:
  name: tencent
  credentials: ~/.tencent/credentials
```
