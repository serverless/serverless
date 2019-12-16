<!--
title: Knative - Knative Guide - Credentials | Serverless Framework
menuText: Credentials
menuOrder: 4
description: How to set up the Serverless Framework with your Kubernetes / Knative credentials
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/credentials/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Credentials

The Serverless Framework needs access to account credentials for your Kubernetes cluster so that it can create and manage Knative resources on your behalf. Additionally the Serverless Framework also needs access to your Docker Hub account to manage the container images which are used for Knative Serving services.

## Kubeconfig files

The Serverless Framework automatically detects and uses a kubeconfig file to communicate with your Kubernetes cluster. The kubeconfig file should be stored at `$HOME/.kube` on your local machine.

For instructions on how to setup kubeconfig files see [the official Kubernetes documentation](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/).

## Docker Hub

The Serverless Framework will leverage a Docker Daemon to build and push container images to Docker Hub if you're not using URLs to existing container images as your function handlers.

Make sure that you have Docker running locally on your machine and you're setting the `provider.docker` variables in your `serverless.yml` file:

```yaml
provider:
  name: knative
  docker:
    username: ${env:DOCKER_HUB_USERNAME}
    password: ${env:DOCKER_HUB_PASSWORD}
```
