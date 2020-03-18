<!--
title: Serverless Framework - Components 最佳实践  - 部署 Python Pyramid 框架
menuText: 部署 Python Pyramid 框架
menuOrder: 4
layout: Doc
-->

[![Serverless Pyramid Tencent Cloud](https://img.serverlesscloud.cn/2020227/1582799581629-pyramid_%E9%95%BF.png)](http://serverless.com)

&nbsp;

# 腾讯云 Pyramid Serverless Component

## 简介

腾讯云 Pyramid Serverless Component, 支持 Restful API 服务的部署.

## 目录

0. [准备](#0-准备)
1. [安装](#1-安装)
1. [配置](#2-配置)
1. [部署](#3-部署)
1. [移除](#4-移除)

### 0. 准备 `

安装 Pyramid，新建 python 文件，例如`app.py`：

```pyyhon
from wsgiref.simple_server import make_server
from pyramid.config import Configurator
from pyramid.response import Response


def hello_world(request):
    return Response('Hello World!')


with Configurator() as config:
    config.add_route('hello', '/')
    config.add_view(hello_world, route_name='hello')
    app = config.make_wsgi_app()

if __name__ == "__main__":
    server = make_server('0.0.0.0', 6543, app)
    server.serve_forever()
```

并将 python 所需要的依赖安装到项目目录，例如本实例需要`Pyramid`，所以可以通过`pip`进行安装：

```
pip install Pyramid -t ./
```

如果因为网络问题，可以考虑使用国内源，例如：

```
pip install Pyramid -t ./ -i https://pypi.tuna.tsinghua.edu.cn/simple
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
PyramidTest:
  component: '@serverless/tencent-pyramid'
  inputs:
    region: ap-guangzhou
    functionName: PyramidFunctionTest
    pyramidProjectName: myPyramid
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

注意，这里的 pyramidProjectName 必须要和你的项目名称一致！

这里要额外说明，`pyramidProjectName`实际上是包括你 app 的那个文件即`app = config.make_wsgi_app()`，并且要确保可以通过`文件名.app`从外引用该文件。

- [更多配置](https://github.com/serverless-tencent/tencent-pyramid/blob/master/docs/configure.md)

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
