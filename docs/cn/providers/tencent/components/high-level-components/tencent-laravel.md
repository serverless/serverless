<!--
title: Serverless Framework - Components 最佳实践  - 部署 PHP Laravel 框架
menuText: 部署 PHP Laravel 框架
menuOrder: 5
layout: Doc
-->

[![Serverless PHP Laravel Tencent Cloud](https://img.serverlesscloud.cn/20191226/1577347087676-website_%E9%95%BF.png)](http://serverless.com)

## 简介

腾讯云 [Laravel](https://github.com/laravel/laravel) Serverless Component, 支持 Restful API 服务的部署。

## 目录

0. [准备](#0-准备)
1. [安装](#1-安装)
1. [配置](#2-配置)
1. [部署](#3-部署)
1. [移除](#4-移除)

### 0. 准备

#### 初始化 Laravel 项目

在使用此组件之前，你需要先自己初始化一个 `laravel` 项目

```
composer create-project --prefer-dist laravel/laravel serverless-laravel
```

> 注意：Laravel 使用 Coposer 管理依赖的，所以你需要先自行安装 Composer，请参考 [官方安装文档](https://getcomposer.org/doc/00-intro.md#installation-linux-unix-macos)

#### 修改 Laravel 项目

由于云函数在执行时，只有 `/tmp` 可读写的，所以我们需要将 `laravel` 框架运行时的 `storage` 目录写到该目录下，为此需要修改 `bootstrap/app.php` 文件，在 `$app = new Illuminate\Foundation\Application` 后添加：

```php
$app->useStoragePath($_ENV['APP_STORAGE'] ?? $app->storagePath());
```

然后在跟目录下的 `.env` 文件中新增如下配置:

```dotenv
# 视图文件编译路径
VIEW_COMPILED_PATH=/tmp/storage/framework/views

# 由于是无服务函数，所以没法存储 session 在硬盘上，如果不需要 sessions，可以使用 array
# 如果需要你可以将 session 存储到 cookie 或者数据库中
SESSION_DRIVER=array

# 建议将错误日志输出到控制台，方便云端去查看
LOG_CHANNEL=stderr

# 应用的 storage 目录必须为 /tmp
APP_STORAGE=/tmp
```

### 1. 安装

通过 npm 全局安装 [serverless cli](https://github.com/serverless/serverless)

```
$ npm install -g serverless
```

### 2. 配置

在项目根目录，创建 `serverless.yml` 文件，在其中进行如下配置

```
$ touch serverless.yml
```

```yml
# serverless.yml

MyComponent:
  component: '@serverless/tencent-laravel'
  inputs:
    region: ap-guangzhou
    functionName: laravel-function
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

- [更多配置](https://github.com/serverless-components/tencent-laravel/tree/master/docs/configure.md)

### 3. 部署

如您的账号未 [登陆](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以直接通过 `微信` 扫描命令行中的二维码进行授权登陆和注册。

通过 `sls` 命令进行部署，并可以添加 `--debug` 参数查看部署过程中的信息

```
$ sls --debug
```

> 注意: `sls` 是 `serverless` 命令的简写。

### 4. 移除

通过以下命令移除部署的 API 网关

```
$ sls remove --debug
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/秘钥信息，也可以本地创建 `.env` 文件

在 `.env` 文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存

如果没有腾讯云账号，可以在此 [注册新账号](https://cloud.tencent.com/register)。

如果已有腾讯云账号，可以在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取 `SecretId` 和`SecretKey`.

```text
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```
