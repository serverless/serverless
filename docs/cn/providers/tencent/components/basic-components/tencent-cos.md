<!--
title: Serverless Framework - 基础 Components  - 对象存储 COS 组件
menuText: 对象存储 COS 组件
menuOrder: 3
layout: Doc
-->

## 简介

该组件是 serverless-tencent 组件库中的基础组件之一。通过对象存储 COS 组件，可以快速，方便的创建，配置和管理腾讯云的 COS 存储桶

## 快速开始

&nbsp;

通过 COS 组件，对一个 COS 存储桶进行完整的创建，配置，部署和删除等操作。支持命令如下：

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

myBucket:
  component: '@serverless/tencent-cos'
  inputs:
    bucket: my-bucket
    region: ap-guangzhou
```

- [点击此处查看配置文档](https://github.com/serverless-tencent/tencent-cos/blob/master/docs/configure.md)

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
  DEBUG ─ Deploying "my-bucket-1300415943" bucket in the "ap-guangzhou" region.
  DEBUG ─ "my-bucket-1300415943" bucket was successfully deployed to the "ap-guangzhou" region.
  DEBUG ─ Setting ACL for "my-bucket-1300415943" bucket in the "ap-guangzhou" region.
  DEBUG ─ Ensuring no CORS are set for "my-bucket-1300415943" bucket in the "ap-guangzhou" region.
  DEBUG ─ Ensuring no Tags are set for "my-bucket-1300415943" bucket in the "ap-guangzhou" region.

  myBucket:
    bucket: my-bucket-1300415943
    region: ap-guangzhou

  10s › myBucket › done
```

### 4. 移除

通过以下命令移除部署的存储桶

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removing files from the "my-bucket-1300415943" bucket.
  DEBUG ─ Removing "my-bucket-1300415943" bucket from the "ap-guangzhou" region.
  DEBUG ─ "my-bucket-1300415943" bucket was successfully removed from the "ap-guangzhou" region.

  2s › myBucket › done
```

#### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/秘钥信息，也可以本地创建 `.env` 文件

```bash
$ touch .env # 腾讯云的配置信息
```

在 `.env` 文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存。

```env
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```

> - 如果没有腾讯云账号，请先 [注册新账号](https://cloud.tencent.com/register)。
> - 如果已有腾讯云账号，可以在 [API 密钥管理
>   ](https://.cloud.tencent.com/cam/capi) 中获取 SecretId 和 SecretKey。

### 还支持哪些组件？

可以在 [Serverless Components](https://github.com/serverless/components) 中查询更多组件的信息。
