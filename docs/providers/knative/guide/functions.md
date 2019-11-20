<!--
title: Knative - Knative Guide - Functions | Serverless Framework
menuText: Functions
menuOrder: 6
description: How to configure Knative Serving services in the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/functions/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Functions

If you are using Knative as a provider, all _functions_ inside the service are [Knative Serving](https://knative.dev/docs/serving) services.

## Configuration

All of the functions in your serverless service can be found in `serverless.yml` under the `functions` property.

```yaml
service: my-service

provider:
  name: knative

# you can overwrite defaults here
#  stage: dev

plugins:
  - serverless-knative

functions:
  functionOne:
    handler: function-one.dockerfile
    context: ./code
  functionTwo:
    handler: gcr.io/knative-releases/github.com/knative/eventing-contrib/cmd/event_display:latest
```

The `handler` property points either to the Dockerfile which describes the container image which should be used as a [Knative Serving](https://knative.dev/docs/serving) service or to a container image on a remote Container Registry.

You might also want to specify the build context if you're using a Dockerfile as your `handler` configuration. You can do this with the `context` configuration. The build context will default to the current working directory if you're not specifying a `context` configuration.

You can specify an array of functions, which is useful if you separate your functions in to different files:

```yaml
# serverless.yml
functions:
  - ${file(./foo-functions.yml)}
  - ${file(./bar-functions.yml)}
```

```yaml
# foo-functions.yml
fooOne:
  handler: fooOne.dockerfile
fooTwo:
  handler: fooTwo.dockerfile
```

Check out the [Serverless Variables](./variables.md) for all the details and options on how to make your configuration more dynamic.
