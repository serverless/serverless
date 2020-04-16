<!--
title: Serverless Framework - 基础 Components  - 云函数 SCF 组件
menuText: 云函数 SCF 组件
menuOrder: 1
layout: Doc
-->

## 简介

该组件是 serverless-tencent 组件库中的基础组件之一。通过云函数 SCF 组件，可以快速，方便的创建，配置和管理腾讯云的 SCF 云函数。

## 快速开始

&nbsp;

通过 SCF 组件，对一个云函数进行完整的创建，配置，部署和删除等操作。支持命令如下：

1. [安装](#1-安装)
2. [创建](#2-创建)
3. [配置](#3-配置)
4. [部署](#4-部署)
5. [移除](#5-移除)

&nbsp;

### 1. 安装

通过 npm 安装 serverless

```bash
$ npm install -g serverless
```

### 2. 创建

```bash
$ mkdir my-function
$ cd my-function
```

目录内容如下：

```bash
|- code
  |- index.js
|- serverless.yml
```

对于该例子可以使用一下 Demo，作为 index.js：

```javascript
'use strict';
exports.main_handler = async (event, context, callback) => {
    .log("%j", event);
    return "hello world"
};

```

### 3. 配置

本地创建 `serverless.yml` 文件，在其中进行如下配置

```bash
$ touch serverless.yml
```

```yml
# serverless.yml
myFunction1:
  component: '@serverless/tencent-scf'
  inputs:
    name: myFunction1
    codeUri: ./code # 代码目录
    handler: index.main_handler
    runtime: Nodejs8.9
    region: ap-guangzhou
    description: My Serverless Function
    memorySize: 128
    timeout: 20
    # 打包zip时希望忽略的文件或者目录配置（可选）
    exclude:
      - .gitignore
      - .git/**
      - node_modules/**
      - .serverless
      - .env
    include:
      - /Users/dfounderliu/Desktop/temp/.serverless/myFunction1.zip
    environment:
      variables:
        TEST: vale
    vpcConfig:
      subnetId: ''
      vpcId: ''

myFunction2:
  component: '@serverless/tencent-scf'
  inputs:
    name: myFunction2
    codeUri: ./code
```

- [点击此处查看配置文档](https://github.com/serverless-tencent/tencent-scf/blob/master/docs/configure.md)

### 4. 部署

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
  DEBUG ─ Starting Website Removal.
  DEBUG ─ Removing Website bucket.
  DEBUG ─ Removing files from the "my-bucket-1300415943" bucket.
  DEBUG ─ Removing "my-bucket-1300415943" bucket from the "ap-guangzhou" region.
  DEBUG ─ "my-bucket-1300415943" bucket was successfully removed from the "ap-guangzhou" region.
  DEBUG ─ Finished Website Removal.
  DEBUG ─ Executing the template's components graph.
  DEBUG ─ Compressing function myFunction file to /Users/dfounderliu/Desktop/temp/code/.serverless/myFunction.zip.
  DEBUG ─ Compressed function myFunction file successful
  DEBUG ─ Uploading service package to cos[sls-cloudfunction-ap-guangzhou-code]. sls-cloudfunction-default-myFunction-1572519895.zip
  DEBUG ─ Uploaded package successful /Users/dfounderliu/Desktop/temp/code/.serverless/myFunction.zip
  DEBUG ─ Creating function myFunction
  DEBUG ─ Created function myFunction successful

  myFunction:
    Name:        myFunction
    Runtime:     Nodejs8.9
    Handler:     index.main_handler
    MemorySize:  128
    Timeout:     3
    Region:      ap-guangzhou
    Role:        QCS_SCFExcuteRole
    Description: This is a template function
    UsingCos:    true

  6s › myFunction › done

```

### 5. 移除

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removed function myFunction successful

  1s › myFunction › done

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
