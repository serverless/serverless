<!--
title: Serverless Framework - Apache OpenWhisk Guide - Installing The Serverless Framework
menuText: Installation
menuOrder: 2
description: How to install the Serverless Framework and start using Apache OpenWhisk
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/openwhisk/guide/installation)

<!-- DOCS-SITE-LINK:END -->

# OpenWhisk - Installation

### Installing Node.js

Serverless is a [Node.js](https://nodejs.org) CLI tool so the first thing you need to do is to install Node.js on your machine.

Go to the official [Node.js website](https://nodejs.org), download and follow the [installation instructions](https://nodejs.org/en/download/) to install Node.js on your local machine.

**Note:** Serverless runs on Node v4 or higher.

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

### Installing OpenWhisk Provider Plugin

Now we need to install the provider plugin to allow the framework to deploy services to the platform. This plugin is also [published](http://npmjs.com/package/serverless-openwhisk) on [npm](https://npmjs.org) and can installed as a project dependency using the `npm install --save-dev` command.

```
npm install serverless-openwhisk --save-dev
```

Project templates already have this dependency listed in the `package.json` file allowing you to just `npm install` in the service directory.

The `serverless-openwhisk` plugin must be saved as a `devDependency` in the project's `package.json` to ensure it is not bundled in the deployment package.

### Setting up OpenWhisk

To run serverless commands that interface with the OpenWhisk platform, you will need to setup your OpenWhisk account credentials on your machine.

[Follow these instructions on setting up OpenWhisk credentials](./credentials.md)
