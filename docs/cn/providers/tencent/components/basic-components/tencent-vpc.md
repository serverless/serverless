<!--
title: Serverless Framework - 基础 Components  - 私有网络 VPC 组件
menuText: 私有网络 VPC 组件
menuOrder: 5
layout: Doc
-->

## 操作场景

腾讯云 VPC 组件支持通过`serverless.yml`配置，快速创建指定名称的私有网络和子网，并输出 VPCID 和 SubnetID，便于配置其他组件所需的网络信息。

## 操作步骤

### 安装

通过 npm 全局安装 [Serverless CLI](https://github.com/serverless/serverless)：

```shell
$ npm install -g serverless
```

### 配置

在项目根目录创建`serverless.yml`文件：

```shell
$ touch serverless.yml
```

在`serverless.yml`中进行如下配置：

```yml
# serverless.yml
MyVpc:
  component: '@serverless/tencent-vpc'
  inputs:
    region: ap-guangzhou
    zone: ap-guangzhou-2
    vpcName: serverless
    subnetName: serverless
```

[查看详细配置文档 >>](https://github.com/serverless-components/tencent-vpc/tree/master/docs/configure.md)

### 部署

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
  DEBUG ─ Creating vpc serverless...
  DEBUG ─ Create vpc serverless success.
  DEBUG ─ Creating subnet serverless...
  DEBUG ─ Create subnet serverless success.

  MyVpc:
    region:     ap-guangzhou
    zone:       ap-guangzhou-2
    vpcName:    serverless
    subnetName: serverless
    subnetId:   subnet-kwtsloz4
    vpcId:      vpc-hqydtuy1

  5s › MyVpc › done
```

### 移除

通过以下命令移除部署的 VPC：

```bash
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Start removing subnet subnet-kwtsloz4
  DEBUG ─ Removed subnet subnet-kwtsloz4
  DEBUG ─ Start removing vpc vpc-hqydtuy1
  DEBUG ─ Removed vpc vpc-hqydtuy1

  7s › MyVpc › done
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/密钥信息，也可以本地创建`.env`文件：

```bash
$ touch .env # 腾讯云的配置信息
```

在`.env`文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存：

```text
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```

> ?

- 如果没有腾讯云账号，请先 [注册新账号](https://cloud.tencent.com/register)。
- 如果已有腾讯云账号，可以在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取 SecretId 和 SecretKey。
