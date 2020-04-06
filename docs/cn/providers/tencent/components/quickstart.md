<!--
title: Serverless Framework - Component 快速开始
menuText: Component 快速开始
menuOrder: 2
layout: Doc
-->

## 操作场景

该文档引导您通过 Serverless Framework Component，在腾讯云上快速创建、配置和部署一个云函数 + API 网关的服务。

## 前提条件

在使用之前，请确保已经 [安装 Serverless Framework 1.57.0 以上版本](https://serverless.com/cn/framework/docs/getting-started/)。

## 操作步骤

### 创建服务

1. 创建并进入目录：

```bash
$ mkdir my-function && cd my-function
```

2. 在目录中创建`index.js`作为云函数的入口函数：

```bash
$ touch index.js
```

3. 在`index.js`中增加如下代码：

```javascript
'use strict';
exports.main_handler = async (event, context, callback) => {
  console.log('%j', event);
  return 'hello world';
};
```

### 配置服务

在本地创建`serverless.yml`文件，

```bash
$ touch serverless.yml
```

在`serverless.yml`中进行如下配置：

```yaml
# serverless.yml
myFunction:
  component: '@serverless/tencent-scf'
  inputs:
    name: myFunction
    codeUri: ./ # 代码目录
    handler: index.main_handler
    runtime: Nodejs8.9
    region: ap-guangzhou
    description: My Serverless Function
    memorySize: 128
    events: # 触发器配置
      - apigw:
          name: serverless
          parameters:
            protocols:
              - http
            endpoints:
              - path: /
                method: GET
```

> ?您可以通过 [详细配置文档](https://github.com/serverless-components/tencent-scf/blob/master/docs/configure.md)，查看`serverless.yml`中所有可用属性的属性列表。

### 部署服务

如您的账号未 [登录](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以在运行该命令后，直接用**微信**扫描命令中弹出的二维码，对云账户进行授权登录和注册。

通过`sls`命令进行部署，并可以添加`--debug`参数查看部署过程中的信息：

> ?`sls`是`serverless`命令的简写。

```bash
sls --debug

  DEBUG ─ Resolving the template's static variables.
  DEBUG ─ Collecting components from the template.
  DEBUG ─ Downloading any NPM components found in the template.
  DEBUG ─ Analyzing the template's components dependencies.
  DEBUG ─ Creating the template's components graph.
  DEBUG ─ Syncing template state.
  DEBUG ─ Executing the template's components graph.
Please scan QR code login from wechat.
Wait login...
Login successful for TencentCloud.
  DEBUG ─ Compressing function myFunction file to /Users/tina/Desktop/live/scfcomponent/my-function/.serverless/myFunction.zip.
  DEBUG ─ Compressed function myFunction file successful
  DEBUG ─ Uploading service package to cos[sls-cloudfunction-ap-guangzhou-code]. sls-cloudfunction-default-myFunction-1582797244.zip
  DEBUG ─ Uploaded package successful /Users/tina/Desktop/live/scfcomponent/my-function/.serverless/myFunction.zip
  DEBUG ─ Creating function myFunction
  DEBUG ─ Created function myFunction successful
  DEBUG ─ Setting tags for function myFunction
  DEBUG ─ Creating trigger for function myFunction
  DEBUG ─ Starting API-Gateway deployment with name myFunction.serverless in the ap-guangzhou region
  DEBUG ─ Service with ID service-qs0cud0s created.
  DEBUG ─ API with id api-irl0q216 created.
  DEBUG ─ Deploying service with id service-qs0cud0s.
  DEBUG ─ Deployment successful for the api named myFunction.serverless in the ap-guangzhou region.
  DEBUG ─ Deployed function myFunction successful

  myFunction:
    Name:        myFunction
    Runtime:     Nodejs8.9
    Handler:     index.main_handler
    MemorySize:  128
    Timeout:     3
    Region:      ap-guangzhou
    Description: My Serverless Function
    APIGateway:
      - serverless - http://service-qs0cud0s-1300862921.gz.apigw.tencentcs.com/release

  22s › myFunction › done
```

### 测试服务

在浏览器中打开输出链接，或替换如下命令中的链接地址，通过 curl 对其进行测试，该链接可以在`sls`命令执行后获取得到。

```bash
$ curl -X GET http://service-qs0cud0s-1300862921.gz.apigw.tencentcs.com/release
```

### 移除服务

如果您不再需要此服务，可以通过如下命令一键移除服务，该命令会清理相应函数和触发器资源。

```sh
serverless remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removing any previously deployed API. api-irl0q216
  DEBUG ─ Removing any previously deployed service. service-qs0cud0s
  DEBUG ─ Removing function
  DEBUG ─ Removed function myFunction successful

  9s › myFunction1 › done
```

### 配置账户信息（可选）

当前默认支持部署时扫描微信二维码登录，如您希望配置持久的环境变量/密钥信息，也可以参考 [配置账号](https://cloud.tencent.com/document/product/1154/43006) 文档。

### 更多应用

如果您希望通过 Serverless Framework Component 部署更多 Serverless 应用，可以参考下列最佳实践：

- [部署 Express 框架](https://serverless.com/cn/framework/docs/providers/tencent/components/high-level-components/tencent-express/)
- [部署 Hexo 静态网站](https://serverless.com/cn/framework/docs/providers/tencent/components/high-level-components/tencent-hexo/)
- [部署 Next.js 框架](https://serverless.com/cn/framework/docs/providers/tencent/components/high-level-components/tencent-nextjs/)
- [部署 Python Flask 框架](https://serverless.com/cn/framework/docs/providers/tencent/components/high-level-components/tencent-flask/)
- [部署 PHP Laravel 框架](https://serverless.com/cn/framework/docs/providers/tencent/components/high-level-components/tencent-laravel/)
