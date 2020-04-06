<!--
title: Serverless Framework - Components 最佳实践  - 部署 Nuxt.js 框架
menuText: 部署 Nuxt.js 框架
menuOrder: 3
layout: Doc
-->

## 操作场景

腾讯云 [Nuxt.js](https://github.com/nuxt/nuxt.js) Serverless Component 支持通过云函数和 API 网关在云端部署 Nuxt.js 框架。

## 前提条件

#### 初始化 Nuxt.js 项目

```bash
$ npx create-nuxt-app serverlesss-nuxtjs
$ cd serverlesss-nuxtjs
```

添加 `express` 依赖：

```
$ npm i express --save
```

> ?这里通过 express 服务来代理 nuxt.js 的服务。

## 操作步骤

### 安装

通过 npm 全局安装 [Serverless CLI](https://github.com/serverless/serverless)：

```bash
$ npm install -g serverless
```

### 配置

在项目根目录创建`serverless.yml`文件：

```bash
$ touch serverless.yml
```

在`serverless.yml`中进行如下配置：

```yml
# serverless.yml
NuxtjsFunc:
  component: '@serverless/tencent-nuxtjs'
  inputs:
    functionName: nuxtjs-function
    region: ap-guangzhou
    code: ./
    functionConf:
      timeout: 30
      memorySize: 128
    environment:
      variables:
        RUN_ENV: test
    apigatewayConf:
      protocols:
        - http
        - https
      environment: release
```

[查看详细配置文档 >>](https://github.com/serverless-components/tencent-nuxtjs/tree/master/docs/configure.md)

### 部署

#### 构建静态资源

```bash
$ npm run build
```

#### 部署到云端

如您的账号未 [登录](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以直接通过**微信**扫描命令行中的二维码进行授权登录和注册。

通过`sls`命令进行部署，并可以添加`--debug`参数查看部署过程中的信息：

> ?`sls`是`serverless`命令的简写。

```bash
$ sls --debug

  DEBUG ─ Resolving the template's static variables.
  DEBUG ─ Collecting components from the template.
  DEBUG ─ Downloading any NPM components found in the template.
  DEBUG ─ Analyzing the template's components dependencies.
  DEBUG ─ Creating the template's components graph.
  DEBUG ─ Syncing template state.
  DEBUG ─ Executing the template's components graph.
  DEBUG ─ Generating serverless handler...
  DEBUG ─ Generated serverless handler successfully.
  DEBUG ─ Compressing function nuxtjs-function file to /Users/yugasun/Desktop/Develop/serverless/tencent-nuxtjs/example/.serverless/nuxtjs-function.zip.
  DEBUG ─ Compressed function nuxtjs-function file successful
  DEBUG ─ Uploading service package to cos[sls-cloudfunction-ap-guangzhou-code]. sls-cloudfunction-default-nuxtjs-function-1584350378.zip
  DEBUG ─ Uploaded package successful /Users/yugasun/Desktop/Develop/serverless/tencent-nuxtjs/example/.serverless/nuxtjs-function.zip
  DEBUG ─ Creating function nuxtjs-function
  DEBUG ─ Created function nuxtjs-function successful
  DEBUG ─ Setting tags for function nuxtjs-function
  DEBUG ─ Creating trigger for function nuxtjs-function
  DEBUG ─ Deployed function nuxtjs-function successful
  DEBUG ─ Starting API-Gateway deployment with name ap-guangzhou-apigateway in the ap-guangzhou region
  DEBUG ─ Service with ID service-dxcq0xuu created.
  DEBUG ─ API with id api-b83j9sme created.
  DEBUG ─ Deploying service with id service-dxcq0xuu.
  DEBUG ─ Deployment successful for the api named ap-guangzhou-apigateway in the ap-guangzhou region.

  NuxtjsFunc:
    functionName:        nuxtjs-function
    functionOutputs:
      ap-guangzhou:
        Name:        nuxtjs-function
        Runtime:     Nodejs8.9
        Handler:     serverless-handler.handler
        MemorySize:  128
        Timeout:     30
        Region:      ap-guangzhou
        Namespace:   default
        Description: This is a template function
    region:              ap-guangzhou
    apiGatewayServiceId: service-dxcq0xuu
    url:                 https://service-dxcq0xuu-1251556596.gz.apigw.tencentcs.com/release/
    cns:                 (empty array)

  38s › NuxtjsFunc › done
```

### 移除

通过以下命令移除部署的 Nuxjs 服务，包括云函数和 API 网关：

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removed function nuxtjs-function successful
  DEBUG ─ Removing any previously deployed API. api-b83j9sme
  DEBUG ─ Removing any previously deployed service. service-dxcq0xuu

  8s › NuxtjsFunc › done
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/密钥信息，也可以本地创建`.env`文件：

```bash
$ touch .env # 腾讯云的配置信息
```

在 `.env` 文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存：

```text
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```

> ?

- 如果没有腾讯云账号，请先 [注册新账号](https://cloud.tencent.com/register)。
- 如果已有腾讯云账号，可以在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取 SecretId 和 SecretKey。

### 更多组件

可以在 [Serverless Components](https://github.com/serverless/components) repo 中查询更多组件的信息。
