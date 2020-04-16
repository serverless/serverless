<!--
title: Serverless Framework - Azure Functions Events - Other Bindings
menuText: Other Bindings
menuOrder: 8
description: Setting up Other Bindings Events with Azure Functions via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/events/other)

<!-- DOCS-SITE-LINK:END -->

## Other Bindings

The Azure Functions plugin also supports additional input and output bindings.
These work by setting the direction explicitly. The properties go under the
`x-azure-settings` property and match the same properties expected in the
`function.json`, with the exception of "type" which is the first property's key.

You can learn about all the bindings Azure has to offer here on the
[official documentation](https://docs.microsoft.com/en-us/azure/azure-functions/functions-triggers-bindings).
