<!--
title: Serverless Framework - Components 最佳实践  - 部署 Python Tornado 框架
menuText: 部署 Python Tornado 框架
menuOrder: 4
layout: Doc
-->

[![Serverless Tornado Tencent Cloud](https://img.serverlesscloud.cn/202031/1583057587331-tornado_%E9%95%BF.png)](http://serverless.com)

&nbsp;

# 腾讯云 Tornado Serverless Component

## 简介

腾讯云 Tornado Serverless Component, 支持 Restful API 服务的部署, 目前只支持 Tornado 3.\*及以前版本，以及支持同步操作，不支持异步操作。

## 目录

0. [准备](#0-准备)
1. [安装](#1-安装)
1. [配置](#2-配置)
1. [部署](#3-部署)
1. [移除](#4-移除)

### 0. 准备 `

安装 Tornado，新建 python 文件，例如`app.py`：

```pyyhon
from tornado.web import RequestHandler

class IndexHandler(RequestHandler):
    def get(self):
        self.write('hello word tornado')


url = [
        (r'/', IndexHandler),
    ]

```

并将 python 所需要的依赖安装到项目目录，例如本实例需要`Tornado`，所以可以通过`pip`进行安装：

```
pip install Tornado -t ./
```

如果因为网络问题，可以考虑使用国内源，例如：

```
pip install Tornado -t ./ -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 1. 安装

通过 npm 全局安装 [serverless cli](https://github.com/serverless/serverless)

```shell
$ npm install -g serverless
```

### 2. 配置

本地创建 `serverless.yml` 文件，在其中进行如下配置

```shell
$ touch serverless.yml
```

```yml
TornadoTest:
  component: '@serverless/tencent-tornado'
  inputs:
    region: ap-guangzhou
    functionName: tornadoFunctionTest
    tornadoProjectName: myTornado
    code: ./
    functionConf:
      timeout: 10
      memorySize: 256
      environment:
        variables:
          TEST: vale
      vpcConfig:
        subnetId: ''
        vpcId: ''
    apigatewayConf:
      protocols:
        - http
      environment: release
```

注: 这里的 tornadoProjectName 必须要和项目名称一致！

这里要额外说明，`tornadoProjectName`实际上是包括你 app 的那个文件即路由列表，并且要确保可以通过`文件名.url`从外引用该文件。

- [更多配置](https://github.com/serverless-tencent/tencent-tornado/blob/master/docs/configure.md)

### 3. 部署

如您的账号未 [登陆](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以直接通过 `微信` 扫描命令行中的二维码进行授权登陆和注册。

通过 `sls` 命令进行部署，并可以添加 `--debug` 参数查看部署过程中的信息

```shell
$ sls --debug
```

### 4. 移除

通过以下命令移除部署的服务

```shell
$ sls remove --debug
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/秘钥信息，也可以本地创建 `.env` 文件

```shell
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
