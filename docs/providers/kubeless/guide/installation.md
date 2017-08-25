<!--
title: Serverless Framework - Kubeless Guide - Installing The Serverless Framework and Kubeless
menuText: Installation
menuOrder: 3
description: How to install the Serverless Framework and start using it with Kubeless
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/guide/installation)
<!-- DOCS-SITE-LINK:END -->

# Kubeless - Installation

## Installing Kubeless in your Kubernetes cluster

Kubeless runs on [Kubernetes](https://kubernetes.io), you need a working Kubernetes cluster to run kubeless. For testing you can use [minikube](https://github.com/kubernetes/minikube).

You should deploy Kubeless in your cluster using one of YAML manifests found in the release package. It will create a *kubeless* Namespace and a *function* ThirdPartyResource. You will see a *kubeless* Controller, and *kafka*, *zookeeper* StatefulSet running.

There are several kubeless manifests being shipped for multiple k8s environments (non-rbac and rbac), please consider to pick up the correct one:

* *kubeless-$RELEASE.yaml* is used for non-RBAC Kubernetes cluster.
* *kubeless-rbac-$RELEASE.yaml* is used for RBAC-enabled Kubernetes cluster.

For example, this below is a show case of deploying kubeless to a non-RBAC Kubernetes cluster.

	$ export RELEASE=0.0.20
	$ kubectl create ns kubeless
	$ kubectl create -f https://github.com/kubeless/kubeless/releases/download/$RELEASE/kubeless-$RELEASE.yaml
	
	$ kubectl get pods -n kubeless
	NAME                                   READY     STATUS    RESTARTS   AGE
	kafka-0                                1/1       Running   0          1m
	kubeless-controller-3331951411-d60km   1/1       Running   0          1m
	zoo-0                                  1/1       Running   0          1m
	
	$ kubectl get deployment -n kubeless
	NAME                  DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
	kubeless-controller   1         1         1            1           1m
	
	$ kubectl get statefulset -n kubeless
	NAME      DESIRED   CURRENT   AGE
	kafka     1         1         1m
	zoo       1         1         1m
	
	$ kubectl get thirdpartyresource
	NAME             DESCRIPTION                                     VERSION(S)
	function.k8s.io   Kubeless: Serverless framework for Kubernetes   v1
	
	$ kubectl get functions

## Installing the Kubeless CLI (optional)

You can optionally install the Kubeless CLI tool.

On Linux, use these commands to install Kubeless CLI in your system:

    $ curl -L https://github.com/kubeless/kubeless/releases/download/0.0.20/kubeless_linux-amd64.zip > kubeless.zip
    $ unzip kubeless.zip
    $ sudo cp bundles/kubeless_linux-amd64/kubeless /usr/local/bin/

On Mac OS X, use these commands to install Kubeless CLI in your system:

    $ curl -L https://github.com/kubeless/kubeless/releases/download/0.0.20/kubeless_darwin-amd64.zip > kubeless.zip
    $ unzip kubeless.zip
    $ sudo cp bundles/kubeless_darwin-amd64/kubeless /usr/local/bin/

| TIP: For detailed installation instructions, visit the [Kubeless releases page](https://github.com/bitnami/kubeless/releases).

## Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the [installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

**Note:** Serverless runs on Node v4 or higher.

You can verify that Node.js is installed successfully by runnning `node --version` in your terminal. You should see the corresponding Node version number printed out.

## Installing the Serverless Framework

Next, install the Serverless Framework via [npm](https://npmjs.org) which was already installed when you installed Node.js.

Open up a terminal and type `npm install -g serverless` to install Serverless.

```bash
npm install -g serverless
```

Once the installation process is done you can verify that Serverless is installed successfully by running the following command in your terminal:

```bash
serverless
```

To see which version of serverless you have installed run:

```bash
serverless --version
```

## Installing Kubeless Provider Plugin

Now we need to install the provider plugin to allow the framework to deploy services to the platform. This plugin is also [published](http://npmjs.com/package/serverless-kubeless) on [npm](https://npmjs.org) and can installed using the same `npm install` command.

```
npm install -g serverless-kubeless
```
