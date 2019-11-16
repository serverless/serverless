<!--
title: Knative - Knative Guide - Installation | Serverless Framework
menuText: Installation
menuOrder: 2
description: How to install the Serverless Framework and start using the Knative provider integration
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/knative/guide/installation/)

<!-- DOCS-SITE-LINK:END -->

# Knative - Installation

### Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the [installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

**Note:** You need Node v8 or higher in order to use the Knative provider integration.

You can verify that Node.js is installed successfully by running `node --version` in your terminal. You should see the corresponding Node version number printed out.

### Installing the Serverless Framework

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

### Setting up Knative on your Kubernetes Cluster

Please follow the [official Knative documentation](https://knative.dev/docs/install) to setup Knative on your Kubernetes cluster. In addition to that make sure that you setup the corresponding [Knative Eventing](https://knative.dev/docs/eventing) components for the event sources you're using (e.g. the Google Cloud PubSub component when using the `gcpPubSub` event source).

### Setting up access to Knative

To run serverless commands that interface with your Knative installation, you will need to setup access to such installation on your machine.

[Follow these instructions on setting up access to your Knative installation](./credentials.md)
