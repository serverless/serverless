<!--
title: Serverless Framework Commands - Auth0 Webtasks - Config Credentials
menuText: config credentials
menuOrder: 1
description: Configure Serverless credentials for Auth0 Webtasks with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/webtasks/cli-reference/config-credentials)
<!-- DOCS-SITE-LINK:END -->

# Auth0 Webtasks - Config Credentials

Before you are able to use the Auth0 Webtasks platform with the Serverless Framework, you will need to setup a local profile. Fortunately, this takes less than a minute. 

```bash
serverless config credentials --provider webtasks
```

You will be asked for a phone number or email. You'll immediately receive a verification code. Enter the verification code and your profile will be entirely setup and ready to use.