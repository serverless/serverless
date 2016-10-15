<!--
title: Functions & Events
menuText: Functions & Events
menuOrder: 4
description: Configuring AWS Lambda functions and their events in the Serverless Framework
layout: Doc
-->

# Functions

All of the functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```
# serverless.yml

service: myService

functions:
  functionOne:
    handler: handler.functionOne
```

You can add as many functions as

# Events