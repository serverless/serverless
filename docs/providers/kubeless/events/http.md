<!--
title: Serverless Framework - Kubeless Events - HTTP Events
menuText: HTTP Events
menuOrder: 1
description: HTTP Events in Kubeless
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/events/http)

<!-- DOCS-SITE-LINK:END -->

# Kubeless HTTP Events

The first type of events that you can create in Kubeless are HTTP events.

When creating HTTP events, Kubeless will create a Kubernetes Service that you can call through Serverless or directly calling the HTTP endpoint.

## Single HTTP Endpoint

If you don't specify the type of event in your `serverless.yml` Kubeless will create an HTTP endpoint by default:

```yml
service: testing-pkg

provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
```

When deploying this `serverless.yml` file, Kubeless will create a Kubernetes service with a single endpoint. Calling that HTTP endpoint will trigger the function associated with it.

## Multiple endpoints with Ingress rules

You can also deploy several endpoints in a single `serverless.yml` file:

```yml
service: todos

provider:
  name: kubeless
  runtime: nodejs6

plugins:
  - serverless-kubeless

functions:
  create:
    handler: todos-create.create
    events:
      - http:
          path: /create
  read-all:
    handler: todos-read-all.readAll
    events:
      - http:
          path: /read-all
  read-one:
    handler: todos-read-one.readOne
    events:
      - http:
          path: /read
  update:
    handler: todos-update.update
    events:
      - http:
          path: /update
  delete:
    handler: todos-delete.delete
    events:
      - http:
          path: /delete
```

If the events HTTP definitions contain a `path` attribute, when deploying this Serverless YAML definition, Kubeless will create the needed [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) rules to redirect each of the requests to the right service. You will need to create an [Ingress Controller](https://kubernetes.io/docs/concepts/services-networking/ingress/#ingress-controllers) to make use of your Ingress rule(s):

```
kubectl get ingress
NAME                    HOSTS                   ADDRESS   PORTS     AGE
ingress-1506350705094   192.168.99.100.nip.io             80        28s
```
