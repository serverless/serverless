<!--
title: Serverless Getting Started Guide
menuText: Get Started
layout: Doc
menuOrder: 0
menuItems:
  - {menuText: AWS Guide, path: /framework/docs/providers/aws/guide/quick-start}
  - {menuText: Azure Functions Guide, path: /framework/docs/providers/azure/guide/quick-start}
  - {menuText: Apache OpenWhisk Guide, path: /framework/docs/providers/openwhisk/guide/quick-start}
  - {menuText: Google Functions Guide, path: /framework/docs/providers/google/guide/quick-start}
  - {menuText: Kubeless Guide, path: /framework/docs/providers/kubeless/guide/quick-start}
  - {menuText: Knative Guide, path: /framework/docs/providers/knative/guide/quick-start}
  - {menuText: Spotinst Guide, path: /framework/docs/providers/spotinst/guide/quick-start}
  - {menuText: Fn Guide, path: /framework/docs/providers/fn/guide/quick-start}
  - {menuText: Cloudflare Workers Guide, path: /framework/docs/providers/cloudflare/guide/quick-start}
  - {menuText: Alibaba Guide , path: /framework/docs/providers/aliyun/guide/quick-start}
  - {menuText: Tencent Guide , path: /framework/docs/providers/tencent/guide/quick-start}
-->

# Get started with Serverless Framework Open Source & AWS

Getting started with Serverless Framework’s Open Source CLI and AWS only takes a few minutes. Install with NPM, or as a standalone binary if you don't use NPM.

## via NPM

Install the serverless CLI via NPM:

```bash
npm install -g serverless
```

_Note: If you don’t already have [Node](https://nodejs.org/en/download/package-manager/) on your machine, install it first. We suggest using the latest LTS version of NodeJS._

If you don't want to install Node or NPM, you can install a standalone binary.

## Install as a standalone binary

### MacOS/Linux

To install the latest version, run this command in your terminal:

```bash
curl -o- -L https://slss.io/install | bash
```

To install an specific version you may set a VERSION variable, for example:

```bash
curl -o- -L https://slss.io/install | VERSION=2.21.1 bash
```

Then, open another terminal window to run the `serverless` program.

### Windows

Install with [Chocolatey](https://chocolatey.org/):

```bash
choco install serverless
```

## Initial setup

Run the command below and follow the prompts:

```bash
serverless
```

The command will guide you to create a new serverless project.

_Note: Users in China are presented with a setup centered around the chinese [Tencent](https://intl.cloud.tencent.com/) provider. If you're based in China and prefer to be presented with steps as outside of China, set the following environment variable: `SERVERLESS_PLATFORM_VENDOR=aws`_

## Upgrade

### via npm

```bash
npm update -g serverless
```

If you have installed `serverless` as a standalone binary, read the following section instead.

### Standalone binary

#### MacOS/Linux

```bash
serverless upgrade
```

#### Windows

```bash
choco upgrade serverless
```

## Set up your free Dashboard account

Learn more about the [Serverless Framework Dashboard](https://serverless.com/framework/) and [sign up for free](https://app.serverless.com).

Once you’ve signed up, login to your dashboard from the CLI:

```bash
serverless login
```

You can either add a new service in your dashboard, or with the CLI, using the command:

```bash
serverless
```
