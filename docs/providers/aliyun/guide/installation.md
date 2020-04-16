<!--
title: Serverless Framework - Alibaba Cloud Function Compute Guide - Installing The Serverless Framework
menuText: Installation
menuOrder: 2
description: How to install the Serverless Framework and start using Alibaba Cloud Function Compute
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aliyun/guide/installation)

<!-- DOCS-SITE-LINK:END -->

# Alibaba Cloud - Installation

### Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the [installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

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

### Installing the Alibaba Cloud Function Compute Provider Plugin

Install the latest plugin by running:

```
serverless plugin install --name serverless-aliyun-function-compute
```

### Setting up Alibaba Cloud Function Compute

To run Serverless commands that issue requests to Alibaba Cloud, you will need to setup your Alibaba Cloud credentials on your machine.

[Follow these instructions on setting up your Alibaba Cloud credentials](./credentials.md)
