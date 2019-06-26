<!--
title: Serverless Framework - Google Cloud Functions Guide - Installing The Serverless Framework
menuText: Installation
menuOrder: 2
description: How to install the Serverless Framework and start using Google Cloud Functions
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/google/guide/installation)

<!-- DOCS-SITE-LINK:END -->

# Google - Installation

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

### Installing the Google Cloud Functions Provider Plugin

Install the latest package from npm by running:

```
npm install --save serverless-google-cloudfunctions
```

### Setting up Google Cloud Functions

To run Serverless commands that issue requests to the Google Cloud, you will need to setup your Google Cloud credentials on your machine.

[Follow these instructions on setting up your Google Cloud credentials](./credentials.md)
