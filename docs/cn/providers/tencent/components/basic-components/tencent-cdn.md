<!--
title: Serverless Framework - 基础 Components  - 内容分发网络 CDN 组件
menuText: 内容分发网络 CDN 组件
menuOrder: 4
layout: Doc
-->

## 简介

该组件是 serverless-tencent 组件库中的基础组件之一。通过 CDN 组件，可以快速方便的创建，配置和管理腾讯云的 CDN 产品。

## 快速开始

&nbsp;

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

MyCDN:
  component: '@serverless/tencent-cdn'
  inputs:
    host: abc.com
    hostType: cos
    origin: ww.test.com
    backupOrigin: ww.test.com
    serviceType: web
    fullUrl: on
    fwdHost: ww.test.com
    https:
      cert: 123
      privateKey: 123
      http2: off
      httpsType: 2
      forceSwitch: -2
```

- [点击此处查看配置文档](https://github.com/serverless-tencent/tencent-cdn/blob/master/docs/configure.md)

### 3. 部署

如您的账号未[登陆](https://cloud.tencent.com/login)或[注册](https://cloud.tencent.com/register)腾讯云，您可以直接通过`微信`扫描命令行中的二维码进行授权登陆和注册。

同时需要到 [内容分发网络](https://console.cloud.tencent.com/cdn) 开通该服务。

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
  DEBUG ─ The CDN domain fullstack.yugasun.com has existed. Updating...
  DEBUG ─ Waiting for CDN deploy success...
  DEBUG ─ CDN deploy success to host: fullstack.yugasun.com
  DEBUG ─ Setup https for fullstack.yugasun.com...

  MyCDN:
    host:   fullstack.yugasun.com
    origin: rahbqkq-a81kuv2-1251556596.cos-website.ap-guangzhou.myqcloud.com
    hostId: 1714502
    https:  true

  100s › MyCDN › done
```

### 4. 移除

通过以下命令移除部署的 CDN 配置：

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Start removing CDN for fullstack.yugasun.com
  DEBUG ─ Waiting for offline fullstack.yugasun.com...
  DEBUG ─ Removing CDN for fullstack.yugasun.com
  DEBUG ─ Removed CDN for fullstack.yugasun.com.

  73s › MyCDN › done
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/秘钥信息，也可以本地创建 `.env` 文件

```bash
$ touch .env # 腾讯云的配置信息
```

在 `.env` 文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存

如果没有腾讯云账号，可以在此[注册新账号](https://cloud.tencent.com/register)。

如果已有腾讯云账号，可以在[API 密钥管理](https://console.cloud.tencent.com/cam/capi)中获取 `SecretId` 和`SecretKey`.

```env
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```

### 还支持哪些组件？

可以在 [Serverless Components](https://github.com/serverless/components) repo 中查询更多组件的信息。
