<!--
title: Serverless Framework - Components 最佳实践 - 部署支持数据库操作的全栈应用
menuText: 部署支持数据库操作的全栈应用
menuOrder: 1
layout: Doc
-->

## 操作场景

该模板可以快速部署一个基于 Vue + Express + PostgreSQL 的全栈 Serverless 应用。主要包含以下组件：

- Serverless RESTful API：通过云函数和 API 网关构建的 Express 框架实现 RESTful API。
- Serverless 静态网站：前端通过托管 Vue.js 静态页面到 COS 对象存储中。
- PostgreSQL Serverless：通过创建 PostgreSQL DB 为全栈网站提供数据库服务。
- VPC：通过创建 VPC 和 子网，提供 SCF 云函数和数据库的网络打通和使用。

## 操作步骤

### 安装

通过 npm 全局安装 [Serverless CLI](https://github.com/serverless/serverless)：

```shell
$ npm install -g serverless
```

### 配置

1.新建一个本地文件夹，使用`create --template-url`命令，下载相关 template。

```console
serverless create --template-url https://github.com/yugasun/tencent-serverless-demo/tree/master/fullstack-serverless-db
```

```bash
$ touch .env # 腾讯云的配置信息
```

2.在项目模板中找到`.env.example`文件，修改名称为`.env`，并在其中配置对应的腾讯云 SecretId 和 SecretKey 信息和地域可用区等信息。

```text
# .env
TENCENT_SECRET_ID=xxx
TENCENT_SECRET_KEY=xxx

# 地域可用区配置
REGION=ap-beijing
ZONE=ap-beijing-3
```

> ?

- 如果没有腾讯云账号，请先 [注册新账号](https://cloud.tencent.com/register)。
- 如果已有腾讯云账号，可以在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取 SecretId 和 SecretKey。

  3.通过执行以下命令，安装所需依赖：

```console
$ npm run bootstrap
```

### 部署

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
  DEBUG ─ Creating vpc serverlessVpc...
  DEBUG ─ Create vpc serverlessVpc success.
  DEBUG ─ Creating subnet serverlessSubnet...
  DEBUG ─ Create subnet serverlessSubnet success.
  DEBUG ─ DB instance serverless existed.
  DEBUG ─ Compressing function fullstack-serverless-db file to /Users/tina/Desktop/fullstack-db/fullstack-serverless-db/.serverless/fullstack-serverless-db.zip.
  DEBUG ─ Compressed function fullstack-serverless-db file successful
  DEBUG ─ Uploading service package to cos[sls-cloudfunction-ap-shanghai-code]. sls-cloudfunction-default-fullstack-serverless-db-1585641392.zip
  DEBUG ─ Uploaded package successful /Users/tina/Desktop/fullstack-db/fullstack-serverless-db/.serverless/fullstack-serverless-db.zip
  DEBUG ─ Deploying function fullstack-serverless-db
  DEBUG ─ Updating code...
  DEBUG ─ Updating configure...
  DEBUG ─ Setting tags for function fullstack-serverless-db
  DEBUG ─ Deployed function fullstack-serverless-db successful
  DEBUG ─ Starting API-Gateway deployment with name ap-shanghai-apigateway in the ap-shanghai region
  DEBUG ─ Service with ID service-xxxxx created.
  DEBUG ─ API with id api-xxxxx created.
  DEBUG ─ Deploying service with id service-xxxxx.
  DEBUG ─ Deployment successful for the api named ap-shanghai-apigateway in the ap-shanghai region.
  DEBUG ─ Preparing website Tencent COS bucket fullstack-serverless-db-120000000.
  DEBUG ─ Bucket "fullstack-serverless-db-120000000" in the "ap-shanghai" region already exist.
  DEBUG ─ Setting ACL for "fullstack-serverless-db-120000000" bucket in the "ap-shanghai" region.
  DEBUG ─ Ensuring no CORS are set for "fullstack-serverless-db-120000000" bucket in the "ap-shanghai" region.
  DEBUG ─ Ensuring no Tags are set for "fullstack-serverless-db-120000000" bucket in the "ap-shanghai" region.
  DEBUG ─ Configuring bucket fullstack-serverless-db-120000000 for website hosting.
  DEBUG ─ Bundling website environment variables.
  DEBUG ─ Website env written to file /Users/tina/Desktop/fullstack-db/fullstack-serverless-db/frontend/src/env.js.
  DEBUG ─ Running npm run build in /Users/tina/Desktop/fullstack-db/fullstack-serverless-db/frontend.
  DEBUG ─ Uploading website files from /Users/tina/Desktop/fullstack-db/fullstack-serverless-db/frontend/dist to bucket fullstack-serverless-db-120000000.
  DEBUG ─ Starting upload to bucket fullstack-serverless-db-120000000 in region ap-shanghai
  DEBUG ─ Uploading directory /Users/tina/Desktop/fullstack-db/fullstack-serverless-db/frontend/dist to bucket fullstack-serverless-db-120000000
  DEBUG ─ Website deployed successfully to URL: https://fullstack-serverless-db-120000000.cos-website.ap-shanghai.myqcloud.com.

  frontend:
    url: https://fullstack-serverless-db-120000000.cos-website.ap-shanghai.myqcloud.com
    env:
      apiUrl: https://service-xxxxx-120000000.sh.apigw.tencentcs.com/release/
  api:
    functionName:        fullstack-serverless-db
    functionOutputs:
      ap-shanghai:
        Name:        fullstack-serverless-db
        Runtime:     Nodejs8.9
        Description: This is a function created by serverless component
    region:              ap-shanghai
    apiGatewayServiceId: service-xxxxx
    url:                 https://service-xxxxx-120000000.sh.apigw.tencentcs.com/release/
  postgresql:
    region:         ap-shanghai
    zone:           ap-shanghai-2
    dBInstanceName: serverless
    connects:
      private: postgresql://tencentdb_xxxxx:secretkeyofdb0.0.0.0:9000/tencentdb_xxxxx
  vpc:
    region:     ap-shanghai
    zone:       ap-shanghai-2
    vpcName:    serverlessVpc
    subnetName: serverlessSubnet
    subnetId:   subnet-xxxxx
    vpcId:      vpc-xxxxx

  33s › frontend › done
```

### 更多组件

您可以在 [Serverless Components](https://github.com/serverless/components) repo 中查询更多组件的信息。
