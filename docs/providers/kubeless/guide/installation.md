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

Once you have a working Kubernetes cluster, you need to install the Kubeless Controller in it. To do this, follow the [installation instructions in the Kubeless README.md file](https://github.com/kubeless/kubeless#installation).

## Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the [installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

**Note:** Serverless runs on Node v4 or higher.

You can verify that Node.js is installed successfully by running `node --version` in your terminal. You should see the corresponding Node version number printed out.

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
