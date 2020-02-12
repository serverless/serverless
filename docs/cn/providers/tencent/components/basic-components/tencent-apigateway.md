<!--
title: Serverless Framework - 基础 Components  - API 网关组件
menuText: API 网关组件
menuOrder: 2
layout: Doc
-->

## 简介

该组件是 serverless-tencent 组件库中的基础组件之一。通过 API 网关组件，可以快速，方便的创建，配置和管理腾讯云的 API 网关产品。

## 快速开始

&nbsp;

通过 API 网关组件，对一个 API 服务/接口进行完整的创建，配置，部署和删除等操作。支持命令如下：

1. [安装](#1-安装)
2. [配置](#2-配置)
3. [部署](#3-部署)
4. [移除](#4-移除)

&nbsp;

### 1. 安装

通过 npm 安装 serverless

```bash
$ npm install -g serverless
```

### 2. 配置

本地创建 `serverless.yml` 文件，在其中进行如下配置

```bash
$ touch serverless.yml
```

```yml
# serverless.yml

restApi:
  component: '@serverless/tencent-apigateway'
  inputs:
    region: ap-shanghai
    protocol: http
    serviceName: serverless
    environment: release
    endpoints:
      - path: /users
        method: POST
        function:
          functionName: myFunction
```

- [点击此处查看配置文档](https://github.com/serverless-tencent/tencent-apigateway/blob/master/docs/configure.md)

### 3. 部署

如您的账号未[登陆](https://cloud.tencent.com/login)或[注册](https://cloud.tencent.com/register)腾讯云，您可以直接通过`微信`扫描命令行中的二维码进行授权登陆和注册。

通过`sls`命令进行部署，并可以添加`--debug`参数查看部署过程中的信息

```bash
$ sls --debug

  DEBUG ─ Resolving the template's static variables.
  DEBUG ─ Collecting components from the template.
  DEBUG ─ Downloading any NPM components found in the template.
  DEBUG ─ Analyzing the template's components dependencies.
  DEBUG ─ Creating the template's components graph.
  DEBUG ─ Syncing template state.
  DEBUG ─ Executing the template's components graph.
  DEBUG ─ Starting API-Gateway deployment with name restApi in the ap-shanghai region
  DEBUG ─ Service with ID service-g1ihx7c7 created.
  DEBUG ─ API with id api-4dv8r7wg created.
  DEBUG ─ Deploying service with id service-g1ihx7c7.
  DEBUG ─ Deployment successful for the api named restApi in the ap-shanghai region.

  restApi:
    protocol:    http
    subDomain:   service-g1ihx7c7-1300415943.ap-shanghai.apigateway.myqcloud.com
    environment: release
    region:      ap-shanghai
    serviceId:   service-g1ihx7c7
    apis:
      -
        path:   /users
        method: POST
        apiId:  api-4dv8r7wg

  24s › restApi › done

```

### 4. 移除

通过以下命令移除部署的 API 网关

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removing any previously deployed API. api-4dv8r7wg
  DEBUG ─ Removing any previously deployed service. service-g1ihx7c7

  13s › restApi › done

```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/秘钥信息，也可以本地创建 `.env` 文件

```bash
$ touch .env # 腾讯云的配置信息
```

在 `.env` 文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存

如果没有腾讯云账号，可以在此[注册新账号](https://cloud.tencent.com/register)。

如果已有腾讯云账号，可以在[API 密钥管理](https://.cloud.tencent.com/cam/capi)中获取 `SecretId` 和`SecretKey`.

```env
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```

### 还支持哪些组件？

可以在 [Serverless Components](https://github.com/serverless/components) 中查询更多组件的信息。
