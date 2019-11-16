<!--
title: Serverless Framework - Azure Functions Guide - Installing The Serverless Framework
menuText: Installation
menuOrder: 2
description: How to install the Serverless Framework and start using Azure Functions
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/azure/guide/installation)

<!-- DOCS-SITE-LINK:END -->

# Azure - Installation

### Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to [install Node.js](https://nodejs.org/en/download/) on your machine.

**Note:** The Azure Functions Serverless Framework plugin requires Node v6.5.0

You can verify that Node.js is installed successfully by running `node --version`
in your terminal. You should see the corresponding Node version number printed
out.

### Installing the Serverless Framework

Next, install the Serverless Framework via [npm](https://npmjs.org) which was
already installed when you installed Node.js.

Open up a terminal and type `npm i -g serverless` to install Serverless.

```bash
npm i -g serverless
```

Once the installation process is done you can verify that Serverless is installed
successfully by running the following command in your terminal:

```bash
sls
```

To see which version of serverless you have installed run:

```bash
sls --version
```

### Installing Azure Functions Provider Plugin

To install, install the latest package from npm, run:

```
npm i --save serverless-azure-functions
```

### Setting up Azure Functions

To run serverless commands that interface with the Azure platform, you will need to set up your Azure subscription credentials on your machine.

[Follow these instructions on setting up Azure subscription credentials](./credentials.md)
