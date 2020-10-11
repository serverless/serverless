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

If you are using Kubeless as a provider, all _functions_ inside the service are Kubernetes Function.v1.k8s.io objects.

## Configuration

All of the Kubeless Functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yml
# serverless.yml
service: my-service

provider:
  name: kubeless
  runtime: python2.7
  memorySize: 512M # optional, maximum memory
  timeout: 10 # optional, in seconds, default is 180
  namespace: funcions # optional, deployment namespace if not specified it uses "default"
  ingress: # optional, ingress configuration if not using nginx
    class: 'traefik' # optional, class of ingress
    hostname: 'example.com'
    tls: true
    tlsSecretName: ingress-example-com-certs

plugins:
  - serverless-kubeless

functions:
  # The top name will be the name of the Function object
  # and the K8s service object to get a request to call the function
  hello:
    # The function to call as a response to the HTTP event
    handler: handler.hello # required, handler set
    description: Description of what the function does # optional, to set the description as an annotation
    memorySize: 512M # optional, maximum memory
    timeout: 10 # optional, in seconds, default is 180
    namespace: funcions # optional, deployment namespace, if not specified "default" will be used
    port: 8081 # optional, deploy http-based function with a custom port, default is 8080
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

You can specify an array of functions, which is useful if you separate your functions in to different files:

```yml
# serverless.yml
---
functions:
  - ${file(./foo-functions.yml)}
  - ${file(./bar-functions.yml)}
```

```yml
# foo-functions.yml
getFoo:
  handler: handler.foo
deleteFoo:
  handler: handler.foo
```

## Runtimes

The Kubeless provider plugin supports the following runtimes.

- Node.js
- Python
- Ruby

Please see the following repository for sample projects using those runtimes:

[https://github.com/serverless/serverless-kubeless/tree/master/examples](https://github.com/serverless/serverless-kubeless/tree/master/examples)

## Installing dependencies

For installing dependencies the standard dependency file should be placed in the function folder:

- For Python functions, it will use the file `requirements.txt`
- For Nodejs functions, `dependencies` in the `package.json` file will be installed
- For Ruby functions, it will use the file `Gemfile.rb`

If one of the above files is found, the dependencies will be installed using a [`Init Container`](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/).

## Environment Variables

You can add environment variable configuration to a specific function in `serverless.yml` by adding an `environment` object property in the function configuration. This object should contain a key/value collection of strings:

```yml
# serverless.yml
service: service-name
provider: kubeless
plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
    environment:
      TABLE_NAME: tableName
```

Or if you want to apply environment variable configuration to all functions in your service, you can add the configuration to the higher level `provider` object. Environment variables configured at the function level are merged with those at the provider level, so your function with specific environment variables will also have access to the environment variables defined at the provider level. If an environment variable with the same key is defined at both the function and provider levels, the function-specific value overrides the provider-level default value. For example:

```yml
# serverless.yml
service: service-name
provider:
  name: kubeless
  environment:
    SYSTEM_NAME: mySystem
    TABLE_NAME: tableName1

plugins:
  - serverless-kubeless

functions:
  hello:
    # this function will have SYSTEM_NAME=mySystem and TABLE_NAME=tableName1 from the provider-level environment config above
    handler: handler.hello
  users:
    # this function will have SYSTEM_NAME=mySystem from the provider-level environment config above
    # but TABLE_NAME will be tableName2 because this more specific config will override the default above
    handler: handler.users
    environment:
      TABLE_NAME: tableName2
```

## Secrets

Kubernetes [secrets](https://kubernetes.io/docs/concepts/configuration/secret/) can be linked to your serverless function by mounting the file or defining environment variables. These can be configured as such in `serverless.yml`.

Given the kubernetes secret named `secret1` created by:
`kubectl create secret generic secret1 --from-literal=username=produser --from-literal=password=happy`

We can access it like so:

**Mounting**

```yml
service: service-name
provider:
  name: kubeless

plugins:
  - serverless-kubeless

functions:
  users:
    # The kubernetes secret  will be mounted at `/secret1`
    # Note that the secret cannot have any `/`'s in the name
    handler: handler.users
    secrets:
      - secret1
```

**Environment Variables**

```yml
service: service-name
provider:
  name: kubeless
  environment:
    SYSTEM_NAME: mySystem
    TABLE_NAME: tableName1

plugins:
  - serverless-kubeless

functions:
  users:
    # The kubernetes secret  will be mounted at `/secret1`
    # Note that the secret cannot have any `/`'s in the name
    handler: handler.users
    environment:
      # The environment variable `PROD_USER_PASSWORD` would be set to "happy"
      - name: PROD_USER_PASSWORD
        valueFrom:
          secretKeyRef:
            - name: secret1
              key: password
```

## Labels

Using the `labels` configuration makes it possible to add `key` / `value` labels to your functions.

Those labels will appear in deployments, services and pods and will make it easier to group functions by label or find functions with a common label.

```yml
provider:
  name: kubeless

plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
    labels:
      foo: bar
```

## Custom hostname and path

It is possible to define a custom hostname and path that will be used to serve a function in a specific endpoint. For doing this, it is necessary to have an [Ingress Controller](https://kubernetes.io/docs/concepts/services-networking/ingress/#ingress-controllers) available in the cluster.

```yml
provider:
  name: kubeless
  hostname: myhostname.io
plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: /hello
```

In the example above, once the Ingress Rule has been processed by the Ingress controller, you can call the function using as endpoint `myhostname.io/hello`.

If no hostname is given but a function specifies a `path`, the plugin will use the IP of the cluster followed by a DNS mapping service. By default [nip.io](http://nip.io) will be used but this can be configured with the property `defaultDNSResolution`.

```yml
provider:
  name: kubeless
  defaultDNSResolution: 'xip.io'
plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
    events:
      - http:
          path: /hello
```

The above will result in an endpoint like `1.2.3.4.xip.io/hello` where `1.2.3.4` is the IP of the cluster server.

The final URL in which the function will be listening can be retrieved executing `serverless info`.

## Custom Ingress Controller and annotations

You can specify a custom Ingress Controller and extra annotations that will be placed in the `metadata.annotations` block of your function's Ingress.

```yml
# Serverless.yml:

provider:
  name: kubeless
  ingress:
    class: 'traefik'
    additionalAnnotations:
      kubernetes.io/tls-acme: 'true'
```

This will change the default annotations of:

```yml
annotations:
  kubernetes.io/ingress.class: nginx
  nginx.ingress.kubernetes.io/rewrite-target: /
```

To the following:

```yml
annotations:
  kubernetes.io/ingress.class: traefik
  traefik.ingress.kubernetes.io/rewrite-target: /
  kubernetes.io/tls-acme: true
```

You can find the above annotations with the following `kubectl` command, after deploying:

```
kubectl describe ingress function-name
```

## Custom images (alpha feature)

It is possible to skip the Kubeless build system and specify a prebuilt image to run a function. This feature is useful for using Kubeless with languages that are still not supported or if the function package [is over 1MB](./packaging.md#package-maximum-size). To get more information about how to use custom images visit the [upstream documentation](https://github.com/kubeless/kubeless/blob/master/docs/runtimes.md#custom-runtime-alpha).

```yml
service: hello

provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
    image: tuna/kubeless-python:0.0.6
```
