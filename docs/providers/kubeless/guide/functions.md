<!--
title: Serverless Framework - Kubeless Guide - Functions
menuText: Functions
menuOrder: 5
description: How to configure Kubeless functions in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/guide/functions)
<!-- DOCS-SITE-LINK:END -->

# Kubeless - Functions

If you are using Kubeless as a provider, all *functions* inside the service are Kubernetes Function.v1.k8s.io objects.

## Configuration

All of the Kubeless Functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: my-service

provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  # The top name will be the name of the Function object
  # and the K8s service object to get a request to call the function
  hello:
    # The function to call as a response to the HTTP event
    handler: handler.hello
```

The `handler` property points to the file and module containing the code you want to run in your function.

```python
// handler.py
import json

def hello(request):
    body = {
        "message": "Go Serverless v1.0! Your function executed successfully!",
        "input": request.json
    }

    response = {
        "statusCode": 200,
        "body": json.dumps(body)
    }

    return response
```

You can add as many functions as you want within this property.

```yml
# serverless.yml
service: my-service

provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  hello_one:
    handler: handler.hello_one
  hello_two:
    handler: handler.hello_two
```

## Runtimes

The Kubeless provider plugin supports the following runtimes.

- Node.js
- Python
- Ruby

Please see the following repository for sample projects using those runtimes:

[https://github.com/serverless/serverless-kubeless/tree/master/examples](https://github.com/serverless/serverless-kubeless/tree/master/examples)
