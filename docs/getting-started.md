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

1. Run this command in your terminal:

```bash
curl -o- -L https://slss.io/install | bash
```

2. After installation completes, open another terminal window, then run this command:

```bash
serverless
```

3. Follow the prompts.

If you have a previously installed version, you can upgrade by running:

```bash
serverless upgrade
```

### Windows

Install with [Chocolatey](https://chocolatey.org/):

```bash
choco install serverless
```

Upgrade:

```bash
choco upgrade serverless
```

## Install via npm

If you don’t already have [Node 6](https://nodejs.org/en/download/package-manager/) or higher on your machine, you’ll need to do that first.

Install the serverless CLI:

```bash
npm install -g serverless
```

Upgrade:

```bash
npm update -g serverless
```

## Set up your free Pro account

Learn more about [Serverless Framework Pro](https://serverless.com/pro/) and [sign up for free](https://dashboard.serverless.com).

Once you’ve signed up for Pro, login to your Pro dashboard from the CLI:

```bash
serverless login
```

You can either add a new service in your dashboard, or with the CLI, using the command:

```bash
serverless
```
