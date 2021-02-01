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

Getting started with Serverless Framework’s Open Source CLI and AWS takes only a few minutes. Install as a standalone binary, or with npm.

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

Then open another terminal window to run `serverless` program.

### Windows

Install with [Chocolatey](https://chocolatey.org/):

```bash
choco install serverless
```

### via npm

_Note: If you don’t already have [Node](https://nodejs.org/en/download/package-manager/) on your machine, you’ll need to install it first. We suggest using the latest LTS version of NodeJS._

Install the serverless CLI:

```bash
npm install -g serverless
```

## Initial setup

Run below command and follow the prompts

```bash
serverless
```

_Note: Users in China are presented with setup centered around chinese [Tencent](https://intl.cloud.tencent.com/) provider. If you're based in China and prefer to be presented with steps as outside of China ensure `SERVERLESS_PLATFORM_VENDOR=aws` in your environment_

## Upgrade

### MacOS/Linux

```bash
serverless upgrade
```

### Windows

```bash
choco upgrade serverless
```

### via npm

```bash
npm update -g serverless
```

## Set up your free Pro account

Learn more about [Serverless Framework Pro](https://serverless.com/pro/) and [sign up for free](https://app.serverless.com).

Once you’ve signed up for Pro, login to your Pro dashboard from the CLI:

```bash
serverless login
```

You can either add a new service in your dashboard, or with the CLI, using the command:

```bash
serverless
```
