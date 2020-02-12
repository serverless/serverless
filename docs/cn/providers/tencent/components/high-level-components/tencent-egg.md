<!--
title: Serverless Framework - Components 最佳实践  - 快速部署 Egg.js 框架
menuText: 快速部署 Egg.js 框架
menuOrder: 1
layout: Doc
-->

[![Serverless Egg Tencent Cloud](https://img.serverlesscloud.cn/20191226/1577361751088-egg_width.png)](http://serverless.com)

## 简介

腾讯云 [Egg.js](https://github.com/eggjs/egg) Serverless Component, 支持 Restful API 服务的部署。

## 目录

0. [准备](#0-准备)
1. [安装](#1-安装)
1. [配置](#2-配置)
1. [部署](#3-部署)
1. [移除](#4-移除)

### 0. 准备

#### 初始化 Egg 项目

```bash
$ mkdir egg-example && cd egg-example
$ npm init egg --type=simple
$ npm i
```

#### 修改 Egg 配置

由于云函数在执行时，只有 `/tmp` 可读写的，所以我们需要将 `egg.js` 框架运行尝试的日志写到该目录下，为此需要修改 `config/config.default.js` 中的配置如下：

```js
const config = (exports = {
  env: 'prod', // 推荐云函数的 egg 运行环境变量修改为 prod
  rundir: '/tmp',
  logger: {
    dir: '/tmp',
  },
});
```

### 1. 安装

通过 npm 全局安装 [serverless cli](https://github.com/serverless/serverless)

```bash
$ npm install -g serverless
```

### 2. 配置

在项目根目录创建 `serverless.yml` 文件，在其中进行如下配置

```bash
$ touch serverless.yml
```

```yml
# serverless.yml

MyComponent:
  component: '@serverless/tencent-egg'
  inputs:
    region: ap-beijing
    functionName: egg-function
    code: ./
    functionConf:
      timeout: 10
      memorySize: 128
      environment:
        variables:
          TEST: vale
      vpcConfig:
        subnetId: ''
        vpcId: ''
    apigatewayConf:
      protocol: https
      environment: release
```

- [更多配置](https://github.com/serverless-components/tencent-egg/tree/master/docs/configure.md)

### 3. 部署

如您的账号未 [登陆](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以直接通过 `微信` 扫描命令行中的二维码进行授权登陆和注册。

通过 `sls` 命令进行部署，并可以添加 `--debug` 参数查看部署过程中的信息

```bash
$ sls --debug
  DEBUG ─ Resolving the template's static variables.
  DEBUG ─ Collecting components from the template.
  DEBUG ─ Downloading any NPM components found in the template.
  DEBUG ─ Analyzing the template's components dependencies.
  DEBUG ─ Creating the template's components graph.
  DEBUG ─ Syncing template state.
  DEBUG ─ Executing the template's components graph.
  DEBUG ─ Compressing function egg-function file to /Users/tina/Desktop/live/egg-proj/.serverless/egg-function.zip.
  DEBUG ─ Compressed function egg-function file successful
  DEBUG ─ Uploading service package to cos[sls-cloudfunction-ap-beijing-code]. sls-cloudfunction-default-egg-function-1581335565.zip
  DEBUG ─ Uploaded package successful /Users/tina/Desktop/live/egg-proj/.serverless/egg-function.zip
  DEBUG ─ Creating function egg-function
  DEBUG ─ Updating code...
  DEBUG ─ Updating configure...
  DEBUG ─ Created function egg-function successful
  DEBUG ─ Setting tags for function egg-function
  DEBUG ─ Creating trigger for function egg-function
  DEBUG ─ Deployed function egg-function successful
  DEBUG ─ Starting API-Gateway deployment with name MyComponent.TencentApiGateway in the ap-beijing region
  DEBUG ─ Service with ID service-n5m5e8x3 created.
  DEBUG ─ API with id api-cmkhknda created.
  DEBUG ─ Deploying service with id service-n5m5e8x3.
  DEBUG ─ Deployment successful for the api named MyComponent.TencentApiGateway in the ap-beijing region.

  MyComponent:
    region:              ap-beijing
    functionName:        egg-function
    apiGatewayServiceId: service-n5m5e8x3
    url:                 https://service-n5m5e8x3-1251971143.bj.apigw.tencentcs.com/release/

  32s › MyComponent › done
```

> 注意: `sls` 是 `serverless` 命令的简写。

### 4. 移除

通过以下命令移除部署的 API 网关

```bash
$ sls remove --debug
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/秘钥信息，也可以本地创建 `.env` 文件

```bash
$ touch .env # 腾讯云的配置信息
```

在 `.env` 文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存

如果没有腾讯云账号，可以在此 [注册新账号](https://cloud.tencent.com/register)。

如果已有腾讯云账号，可以在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取 `SecretId` 和`SecretKey`.

```text
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```
