<!--
title: 快速开始
menuText: 快速开始
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

# Serverless Framework 快速开始

首先，需要将 Serverless Framework 开源 CLI安装到本地环境。

```
# 安装 serverless cli
npm install -g serverless

# 或者更新 serverless cli 到最新版本
npm update -g serverless
```

如果你的环境中还没有安装 Node 8 或者更高的版本，那么你需要首先安装 [Node.js](https://nodejs.org/zh-cn/download/)

Serverless Framework 安装完毕后，您可以直接运行如下命令，即可快速通过CLI部署你的第一个 Serverless应用。

```
# 创建一个新的 serverless 服务
serverless create -t tencent-nodejs
```

更多高阶能力的支持，可以参考[快速入门](./providers/tencent/cli-reference/quick-start)，或者参照左侧目录，进一步探索。