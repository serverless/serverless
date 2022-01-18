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

**首先，需要将 Serverless Framework 安装到本地环境。**

## 方式一：二进制安装

如果您的本地环境没有安装 Node.js，您可以直接使用二进制的方式进行安装：

### MacOS/Linux 系统

打开命令行，输入以下命令：

```sh
$ curl -o- -L https://slss.io/install | bash
```

如果之前您已经安装过二进制版本，可以通过下列命令进行升级：

```sh
$ serverless upgrade
```

### Windows 系统

Windows 系统支持通过 [chocolatey](https://chocolatey.org/) 进行安装。打开命令行，输入以下命令：

```sh
$ choco install serverless
```

如果之前您已经安装过二进制版本，可以通过下列命令进行升级：

```sh
$ choco upgrade serverless
```

## 方式二：NPM 安装

```bash
# 安装 serverless cli
npm install -g serverless

# 或者更新 serverless cli 到最新版本
npm install -g serverless
```

如果你的环境中还没有安装 Node 8 或者更高的版本，那么你需要首先安装 [Node.js](https://nodejs.org/zh-cn/download/)

**Serverless Framework 安装完毕后，您可以直接运行如下命令，即可快速通过 Serverless Framework 快速部署你的第一个 Serverless 应用。**

```bash
# 创建一个新的 serverless 服务
serverless
```

更多高阶能力的支持，可以参考[快速入门](./providers/tencent/components/quickstart.md)，或者参照左侧目录，进一步探索。
