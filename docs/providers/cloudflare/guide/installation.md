<!--
title: Serverless Framework - Cloudflare Workers Guide - Installing The Serverless Framework and Cloudflare Workers
menuText: Installation
menuOrder: 3
description: How to install the Serverless Framework and start using it with Cloudflare Workers
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/cloudflare/guide/installation)

<!-- DOCS-SITE-LINK:END -->

# Cloudflare Workers - Installation

## Installing Cloudflare Workers

Cloudflare Workers don’t actually require any installation to run. However, You will need to set your Global API key from Cloudflare as an environmental variable named `CLOUDFLARE_AUTH_KEY`, and your Cloudflare account email as an environmental variable named `CLOUDFLARE_AUTH_EMAIL`. You can get your Global API key from your [Cloudflare profile](https://dash.cloudflare.com/profile) page.

Environmental variables are variables that live inside your terminal.

For Mac and Linux users, you can set environmental variables like this:

```bash
export CLOUDFLARE_AUTH_KEY=YOUR_API_KEY_HERE
export CLOUDFLARE_AUTH_EMAIL=YOUR_CLOUDFLARE_EMAIL
```

And for Windows (CMD) users, you can set environmental variables like this:

```bash
set CLOUDFLARE_AUTH_KEY=YOUR_API_KEY_HERE
set CLOUDFLARE_AUTH_EMAIL=YOUR_CLOUDFLARE_EMAIL
```

You’ll need to redefine your environmental variables after each time you close your terminal.

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

Remember, you need at least version 1.31.0 to use Cloudflare Workers with Serverless.

## Installing the serverless-cloudflare-workers plugin

Finally, add our `serverless-cloudflare-workers` plugin to your project by running `npm install --save serverless-cloudflare-workers`.
