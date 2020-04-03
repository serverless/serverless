<!--
title: Serverless Framework - Components 最佳实践  - 部署 ThinkPHP 框架
menuText: 部署 ThinkPHP 框架
menuOrder: 5
layout: Doc
-->

## 操作场景

腾讯云 [ThinkPHP](https://github.com/top-think/think) Serverless Component，支持 Restful API 服务的部署。

## 前提条件

#### 初始化 ThinkPHP 项目

在使用此组件之前，您需要先初始化一个`ThinkPHP`项目：

```bash
$ composer create-project topthink/think serverless-thinkphp
```

> ?ThinkPHP 使用 Composer 管理依赖，所以需要先自行安装 Composer，请参考 [官方安装文档](https://getcomposer.org/doc/00-intro.md#installation-linux-unix-macos)。

## 操作步骤

### 安装

通过 npm 全局安装 [Serverless CLI](https://github.com/serverless/serverless)：

```bash
$ npm install -g serverless
```

### 配置

在项目根目录，创建`serverless.yml`文件：

```bash
$ touch serverless.yml
```

在`serverless.yml`中进行如下配置：

```yml
# serverless.yml

MyThinkPHP:
  component: '@serverless/tencent-thinkphp'
  inputs:
    region: ap-guangzhou
    functionName: thinkphp-function
    code: ./
    functionConf:
      timeout: 10
      memorySize: 128
      environment:
        variables:
          TEST: abc
      vpcConfig:
        subnetId: ''
        vpcId: ''
    apigatewayConf:
      protocols:
        - https
      environment: release
```

[查看详细配置文档 >>](https://github.com/serverless-components/tencent-thinkphp/tree/master/docs/configure.md)

### 部署

> !在部署前，您需要先清理本地运行的配置缓存，执行`php think clear`即可。

如您的账号未 [登录](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以直接通过 `微信` 扫描命令行中的二维码进行授权登录和注册。

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
  DEBUG ─ Compressing function thinkphp-function file to /Users/yugasun/Desktop/Develop/serverless/tencent-thinkphp/example/.serverless/thinkphp-function.zip.
  DEBUG ─ Compressed function thinkphp-function file successful
  DEBUG ─ Uploading service package to cos[sls-cloudfunction-ap-guangzhou-code]. sls-cloudfunction-default-thinkphp-function-1584413066.zip
  DEBUG ─ Uploaded package successful /Users/yugasun/Desktop/Develop/serverless/tencent-thinkphp/example/.serverless/thinkphp-function.zip
  DEBUG ─ Creating function thinkphp-function
  DEBUG ─ Created function thinkphp-function successful
  DEBUG ─ Setting tags for function thinkphp-function
  DEBUG ─ Creating trigger for function thinkphp-function
  DEBUG ─ Deployed function thinkphp-function successful
  DEBUG ─ Starting API-Gateway deployment with name ap-guangzhou-apigateway in the ap-guangzhou region
  DEBUG ─ Service with ID service-qndauhr4 created.
  DEBUG ─ API with id api-6krpwfpo created.
  DEBUG ─ Deploying service with id service-qndauhr4.
  DEBUG ─ Deployment successful for the api named ap-guangzhou-apigateway in the ap-guangzhou region.

  MyThinkPHP:
    functionName:        thinkphp-function
    functionOutputs:
      ap-guangzhou:
        Name:        thinkphp-function
        Runtime:     Php7
        Handler:     serverless-handler.handler
        MemorySize:  128
        Timeout:     10
        Region:      ap-guangzhou
        Namespace:   default
        Description: This is a template function
    region:              ap-guangzhou
    apiGatewayServiceId: service-qndauhr4
    url:                 https://service-qndauhr4-1251556596.gz.apigw.tencentcs.com/release/
    cns:                 (empty array)

  18s › MyThinkPHP › done
```

### 移除

通过以下命令移除部署的 API 网关：

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removed function thinkphp-function successful
  DEBUG ─ Removing any previously deployed API. api-6krpwfpo
  DEBUG ─ Removing any previously deployed service. service-qndauhr4

  8s › MyThinkPHP › done
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

您可以在 [Serverless Components](https://github.com/serverless/components) repo 中查询更多组件的信息。
