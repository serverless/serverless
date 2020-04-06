<!--
title: Serverless Framework - Components 最佳实践  - 部署 Python Django 框架
menuText: 部署 Python Django 框架
menuOrder: 4
layout: Doc
-->

[![Serverless Django Tencent Cloud](https://img.serverlesscloud.cn/202031/1583057395084-django_%E9%95%BF.png)](http://serverless.com)

&nbsp;

# 腾讯云 Django Serverless Component

## 简介

腾讯云 Django Serverless Component, 支持 Restful API 服务的部署.

## 目录

0. [准备](#0-准备)
1. [安装](#1-安装)
1. [配置](#2-配置)
1. [部署](#3-部署)
1. [移除](#4-移除)

### 0. 准备

新建一个 Django 服务，可以参考[官方文档](https://docs.djangoproject.com/zh-hans/3.0/)。之后创建一个 app(mytest)：

view.py

```python
from django.shortcuts import render
from django.http import HttpResponse

# Create your views here.

def hello(request):
    return HttpResponse("Hello world ! ")

```

增加路由信息：

```python
"""mydjango URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/3.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
# from django.contrib import admin
from django.urls import path
from mytest.views import hello

urlpatterns = [
    path('hello/', hello),
    # path('admin/', admin.site.urls),
]

```

对`settings.py`进行修改:

- 注释掉数据库部分，如果有需要可以考虑使用 mysql 等；
- `ALLOWED_HOSTS`部分增加`*`: `ALLOWED_HOSTS = ['*']`

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
DjangoTest:
  component: '@serverless/tencent-django'
  inputs:
    region: ap-guangzhou
    functionName: DjangoFunctionTest
    djangoProjectName: mydjango
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

注意，这里的 djangoProjectName 必须要和项目名称一致！

并将 python 所需要的依赖安装到项目目录，例如本实例需要`Django`，所以可以通过`pip`进行安装：

```
pip install Django -t ./
```

如果因为网络问题，可以考虑使用国内源，例如：

```
pip install Django -t ./ -i https://pypi.tuna.tsinghua.edu.cn/simple
```

- [更多配置](https://github.com/serverless-tencent/tencent-django/blob/master/docs/configure.md)

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
