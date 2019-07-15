<!--
title: Serverless Framework - Spotinst Events - http
menuText: API Gateway
menuOrder: 1
description: Setting up http events with Spotinst via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/events/http)

<!-- DOCS-SITE-LINK:END -->

# HTTP

Spotinst Functions are automatically given an HTTP endpoint when they are created. This means that you do not need to specify the event type when writing your function. After you deploy your function for the first time a unique URL is generated based on the application ID, environment where your application is launched, and the function ID. Here is a sample of how the URL is created

`https://{app id}{environment id}.spotinst.io/{function id}`

For information on your application ID, environment ID and function ID please checkout your Spotinst Functions dashboard on the [Spotinst website](https://console.spotinst.com/#/dashboard)
