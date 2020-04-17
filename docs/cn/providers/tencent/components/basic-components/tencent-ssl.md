<!--
title: Serverless Framework - 基础 Components  - SSL 证书组件
menuText: SSL 证书组件
menuOrder: 5
layout: Doc
-->

## 操作场景

腾讯云 SSL 证书（SSL Certificates）提供了安全套接层（SSL）证书的一站式服务，包括证书申请、管理及部署功能。

## 操作步骤

### 安装

通过 npm 全局安装 serverless

```console
$ npm install -g serverless
```

### 配置

本地创建`serverless.yml`文件：

```console
$ touch serverless.yml
```

在`serverless.yml`中进行如下配置：

```yml
# serverless.yml
SSLTest:
  component: '@serverless/tencent-ssl'
  inputs:
    domain: any******s.cn
    dvAuthMethod: DNS
    email: serv*******exe.cn
    phone: 135******691
    validityPeriod: 12
    alias: 测试证书
```

> !

- 只支持为域名申请 1 年有效期的免费 DV 证书。
- 只支持证书的创建和移除，不支持续费、重新颁发等。
- 对于腾讯云解析的域名，该组件支持对证书进行自动 DNS 验证；对于非腾讯云解析域名，证书申请完毕后，需要进行验证才可使用，参考 [域名验证指引](https://cloud.tencent.com/document/product/400/4142)。

### 部署

如您的账号未 [登录](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register) 腾讯云，您可以直接通过**微信**扫描命令行中的二维码进行授权登录和注册。

通过`sls`命令进行部署，并可以添加`--debug`参数查看部署过程中的信息：

```console
$ sls --debug

  DEBUG ─ Resolving the template's static variables.
  DEBUG ─ Collecting components from the template.
  DEBUG ─ Downloading any NPM components found in the template.
  DEBUG ─ Analyzing the template's components dependencies.
  DEBUG ─ Creating the template's components graph.
  DEBUG ─ Syncing template state.
  DEBUG ─ Executing the template's components graph.
  DEBUG ─ Applying Certificate ...
  DEBUG ─ Applyed Certificate ...

  SSLTest:
    CertificateId:                    blnwqO0v
    Please add the resolution record:
      Domain:      an********cn
      Host record: _dnsauth
      Record type: TXT
      Value:       20200316*********k6y8kmutd

  1s › SSLTest › done
```

### 移除

```console
$ sls remove --debug

  DEBUG ─ Flushing template state and removing all components.
  DEBUG ─ Removing ...
  DEBUG ─ Removing CertificateId blfZE0B8

  3s › SSLTest › done
```

### 账号配置（可选）

当前默认支持 CLI 扫描二维码登录，如您希望配置持久的环境变量/密钥信息，也可以本地创建`.env`文件：

```console
$ touch .env # 腾讯云的配置信息
```

在`.env`文件中配置腾讯云的 SecretId 和 SecretKey 信息并保存。

```
# .env
TENCENT_SECRET_ID=123
TENCENT_SECRET_KEY=123
```

> ?

- 如果没有腾讯云账号，请先 [注册新账号](https://cloud.tencent.com/register)。
- 如果已有腾讯云账号，可以在 [API 密钥管理](https://console.cloud.tencent.com/cam/capi) 中获取 SecretId 和 SecretKey。

### 更多组件

您可以在 [Serverless Components](https://github.com/serverless/components) repo 中查询更多组件的信息。
