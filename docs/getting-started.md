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

# Getting Started with the Serverless Framework and AWS

First things first, let's get the Serverless Framework open source CLI installed on your machine.

```bash
# Install the serverless cli
npm install -g serverless

# Or, update the serverless cli from a previous version
npm update -g serverless
```

If you don’t already have [Node 6](https://nodejs.org/en/download/package-manager/) or higher on your machine, you’ll need to do that first.

If you already registered for a [Serverless Framework Dashboard](https://dashboard.serverless.com) account, login to your account from the CLI.

```bash
serverless login
```

Once you have the Serverless Framework installed, simply run the `serverless` command and follow the prompts. In no time you will have deployed your first serverless app using the Serverless Framework [CLI](./providers/) and configured your [Serverless Framework Dashboard](./dashboard/) account to automatically monitor your serverless app, generate alerts, and much more. If you already have an existing Serverless Framework Dashboard account, you'll be prompted for your organization and application as well.

```bash
# Create and deploy a new service/project
serverless
```

Want to try out the Serverless Framework on a different cloud provider? Click on any of the cloud provider quick start guides, to the left, to get started.
