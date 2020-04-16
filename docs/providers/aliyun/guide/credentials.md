<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Credentials
menuText: Credentials
menuOrder: 3
description: How to set up the Serverless Framework with your Alibaba Cloud Function Compute credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/credentials)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Credentials

The Serverless Framework needs access to account credentials for your Alibaba Cloud account so that it can create and manage resources on your behalf.

## Create an Alibaba Cloud Account

You need a Billing Account to use Alibaba Cloud Function Compute. See <a href="https://www.alibabacloud.com/help/doc-detail/50482.htm" target="_blank">Create an Alibaba Cloud account
</a> and <a href="https://www.alibabacloud.com/help/doc-detail/50517.htm" target="_blank">Add billing information</a> on how to create a Billing Account. For some regions in mainland China (including the plugin's default region of Shanghai) you will also have to go through <a href="https://www.alibabacloud.com/help/doc-detail/52595.htm" target="_blank">Real Name Verification</a>. To avoid this, use a region outside of Mainland China such as `ap-southeast-1` by setting the `region` option in the `provider` section of your `serverless.yml`.

## Enable Services

You need to enable the following services so that Serverless can create the corresponding resources.

- <a href="https://www.alibabacloud.com/product/ram" target="_blank">Resource Access Management</a>
- <a href="https://www.alibabacloud.com/product/log-service" target="_blank">Log Service</a>
- <a href="https://www.alibabacloud.com/product/api-gateway" target="_blank">API Gateway</a>
- <a href="https://www.alibabacloud.com/product/oss" target="_blank">Object Storage Service</a>
- <a href="https://www.alibabacloud.com/products/function-compute" target="_blank">Function Compute</a>

## Get the Credentials

You need to create credentials Serverless can use to create resources in your Project.

1. Create a RAM user and an AccessKey. See <a href="https://www.alibabacloud.com/help/doc-detail/28637.htm" target="_blank">Alibaba Cloud's documentation</a> on how to create one. Be sure to save the AccessKey information (Click the dropdown "Access Key Details") in the dialog displaying "Access key successfully created.".
2. Attach necessary authorization policies to the RAM user. See <a href="https://www.alibabacloud.com/help/doc-detail/28653.htm" target="_blank">Alibaba Cloud's documentation</a> for details. For Serverless to work, following policies are needed:

- AliyunOSSFullAccess
- AliyunRAMFullAccess
- AliyunLogFullAccess
- AliyunApiGatewayFullAccess
- AliyunFCFullAccess

3. Go to the <a href="https://account.console.aliyun.com/#/secure" target="_blank">Security Settings</a> page to get the Account ID of your Alibaba Cloud account.
4. Create a file containing the credentials that you have collected.

```ini
[default]
aliyun_access_key_secret = <collected in step 1>
aliyun_access_key_id = <collected in step 1>
aliyun_account_id = <collected in step 3>
```

5. Save the credentials file somewhere secure. We recommend making a folder in your root folder and putting it there, like `~/.aliyuncli/credentials`. Remember the path you saved it to.

## Update the `provider` config in `serverless.yml`

Open up your `serverless.yml` file and update the `provider` section with
the path to your credentials file (this path needs to be absolute!). It should look something like this:

```yml
provider:
  name: aliyun
  runtime: nodejs8
  credentials: ~/.aliyuncli/credentials
```
