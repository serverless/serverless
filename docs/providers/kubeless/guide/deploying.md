<!--
title: Serverless Framework - Kubeless Guide - Deploying
menuText: Deploying
menuOrder: 7
description: How to deploy your Kubeless functions and their required infrastructure
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/guide/deploying)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Deploying

The Serverless Framework was designed to provision your Kubeless Functions and Events. It does this via a couple of methods designed for different types of deployments.

## Deploy All

This is the main method for doing deployments with the Serverless Framework:

```bash
serverless deploy -v
```

Use this method when you have updated your Function, Event or Resource configuration in `serverless.yml` and you want to deploy that change (or multiple changes at the same time) to your Kubernetes cluster.

**Note:** You can specify a different configuration file name with the the `--config` option.

### How It Works

The Serverless Framework translates all syntax in `serverless.yml` to [the Function object API](https://github.com/kubeless/kubeless/blob/master/pkg/spec/spec.go) calls to provision your Functions and Events.

For each function in your `serverless.yml` file, Kubeless will create an Kubernetes Function object and for each HTTP event, it will create a [Kubernetes service](https://kubernetes.io/docs/concepts/services-networking/service/).

For example, let's take the following example `serverless.yml` file:

```yaml
service: new-project
provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  hello:
    handler: handler.hello
```

When deploying that file, the following objects will be created in your Kubernetes cluster:

```
$ kubectl get functions

NAME      KIND
hello     Function.v1.k8s.io
```

```
$ kubectl get all

NAME                       READY     STATUS    RESTARTS   AGE
po/hello-699783077-dk15r   1/1       Running   0          2m

NAME             CLUSTER-IP   EXTERNAL-IP   PORT(S)    AGE
svc/hello        10.0.0.39    <none>        8080/TCP   2m

NAME           DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
deploy/hello   1         1         1            1           2m

NAME                 DESIRED   CURRENT   READY     AGE
rs/hello-699783077   1         1         1         2m
```

Kubeless will create a [Kubernetes Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) for your function and a [Kubernetes service](https://kubernetes.io/docs/concepts/services-networking/service/) for each event.

Deployment will spin up a [Pod](https://kubernetes.io/docs/concepts/workloads/pods/pod-overview/)) based on runtime you have defined in your `serverless.yml`. Runtime is a public docker image, providing only binaries for your code. Function code itself is injected into Pod by `kubeless-controller-manager` and stored in Kubernetes Function object definition.

Kubernetes Function definition has a size limit, since it is stored as yaml in cluster's etcd. So, you can't deploy function any larger than approximately 1.5MB.

In order to overcome this limitation, function code can be fetched from [external url](https://kubeless.io/docs/advanced-function-deployment/); in this case only link (and checksum) is stored in Kubernetes function definition. Starting from v0.8.0 of `serverless-kubeless`, you can change default deployment method to `S3ZipContent` and configure `serverless-kubeless` with S3 bucket, where the function code will be stored:

```yaml
provider:
  name: kubeless
  runtime: python2.7
  deploy:
    strategy: S3ZipContent
    options:
      accessKeyId: minio
      secretAccessKey: minio123
      endpoint: http://minio.local
      bucket: workbench
      region: eu-central-1
      s3ForcePathStyle: True
```

## Deploy Function

This deployment method updates or deploys a single function. It performs the platform API call to deploy your package without the other resources. It is much faster than redeploying your whole service each time.

```bash
serverless deploy function --function myFunction
```

### Tips

Check out the [deploy command docs](../cli-reference/deploy.md) for all details and options.
