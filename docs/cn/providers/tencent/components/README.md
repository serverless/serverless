<!--
title: Serverless - Tencent SCF - Components 概述
menuText: Components 概述
layout: Doc
menuItems:
  - {menuText: 基础 Components , path: /framework/docs/providers/tencent/components/basic-components}
  - {menuText: Components 最佳实践, path: /framework/docs/providers/tencent/components/high-level-components}
-->

Serverless Components 是支持多个云资源编排和组织的场景化解决方案，主要基于客户的具体场景，如 Express 框架支持、网站部署等。Serverless Components 可以有效简化云资源的配置和管理，将网关、COS 和 CAM 等产品联动起来，让客户更多关注场景和业务。

详细介绍可以参考 [Github 上的 Serverless Components 项目](https://github.com/serverless/components/blob/master/README_CN.md)。

## Components 和 Framework CLI 的区别


| 对比项 | 功能描述 | 配置说明 | 支持的语言 |
|---------|---------|---------|---------|
| Serverless Framework | 覆盖了测试/部署等步骤的工作流框架 | 主要围绕云函数 SCF 及其触发器进行配置 | 支持云函数平台的除 Java 外所有开发语言（Node.js、Python、PHP、Go 等） |
| Serverless Components | 面向客户实现场景，支持对云上的多种资源进行部署和编排（COS、API 网关、CAM、DB 等） | 支持客户自定义对应资源的配置| Component 本身由 Node.js 开发，但使用时支持多种语言及开发框架  |

## 优势特性

- **简便易用**
Serverless Components 更多的围绕客户场景进行构建，如网站、博客系统、支付服务、图像处理场景等。通过抽象了底层的基础设施配置信息，开发者可以通过十分简单的配置实现场景。
- **可复用性**
Serverless Components 可以通过非常简单的`serverless.yml`创建和部署，但同时也支持用十分简单的语法对 JavaScript 库`serverless.js`进行扩展编写和复用。
- **秒级部署**
大多数 Serverless Components 比传统的配置工具部署快20倍左右，Components 可以通过快速的部署和远端验证，有效减少本地模拟和调试的环节。

## 最佳实践
 
以下为常用的用例模板：

- [部署 Hexo 静态博客](https://cloud.tencent.com/document/product/1154/40217)
通过 Serverless Website 组件快速构建一个 Serverless Hexo 站点：
```shell
serverless create --template-url https://github.com/serverless/components/tree/master/templates/tencent-hexo-blog
```

- [快速构建 REST API](https://cloud.tencent.com/document/product/1154/40216)
通过 Serverless SCF 组件快速构建一个 REST API 应用，实现 GET/PUT 操作。
```shell
serverless create --template-url https://github.com/serverless/components/tree/master/templates/tencent-python-rest-api
```

- [部署 Serverless 全栈 Web 应用（React.js）](https://cloud.tencent.com/document/product/1154/40218)
本示例以 React 为前端，Express 框架作为后端，通过多个 Serverless Components 部署 Serverless 全栈应用程序。
```shell
serverless create --template-url https://github.com/serverless/components/tree/master/templates/tencent-fullstack-react-application
```

- [部署 Serverless 全栈 Web 应用（Vue.js）](https://cloud.tencent.com/document/product/1154/39272)
本示例以 Vue 为前端，Express 框架作为后端，通过多个 Serverless Components 部署 Serverless 全栈应用程序。
```shell
serverless create --template-url https://github.com/serverless/components/tree/master/templates/tencent-fullstack-vue-application
```

## Serverless Components 支持列表

当前 Serverless Components 支持丰富的多语言开发框架和应用，如下所示：
![](https://main.qcloudimg.com/raw/fb863fbfe72526360c0cd7fc4caa1d98.png)

基础组件：
- [@serverless/tencent-apigateway](https://cloud.tencent.com/document/product/1154/39268) - 腾讯云 API 网关组件
- [@serverless/tencent-cos](https://cloud.tencent.com/document/product/1154/39273) - 腾讯云对象存储组件
- [@serverless/tencent-scf](https://cloud.tencent.com/document/product/1154/39271) - 腾讯云云函数组件
- [@serverless/tencent-cdn](https://cloud.tencent.com/document/product/1154/40491) - 腾讯云 CDN 组件
- [@serverless/tencent-cam-role](https://cloud.tencent.com/document/product/1154/39275) - 腾讯云 CAM 角色组件
- [@serverless/tencent-cam-policy](https://cloud.tencent.com/document/product/1154/39274) - 腾讯云 CAM 策略组件

高阶组件：
- [@serverless/tencent-express](https://cloud.tencent.com/document/product/1154/39269) - 快速部署基于 Express.js 的后端服务到腾讯云函数的组件
- [@serverless/tencent-egg](https://cloud.tencent.com/document/product/1154/40492) - 快速部署基于 Egg.js 的后端服务到腾讯云函数的组件
- [@serverless/tencent-koa](https://cloud.tencent.com/document/product/1154/40493) - 快速部署基于 Koa.js 的后端服务到腾讯云函数的组件
- [@serverless/tencent-flask](https://cloud.tencent.com/document/product/1154/40495) - 腾讯云 Python Flask RESTful API 组件
- [@serverless/tencent-laravel](https://cloud.tencent.com/document/product/1154/40494) - 腾讯云 PHP Laravel RESTful API 组件
- [@serverless/tencent-website](https://cloud.tencent.com/document/product/1154/39276) - 快速部署静态网站到腾讯云的组件

第三方贡献：
- [@twn39/tencent-fastify](https://github.com/twn39/tencent-fastify) - 快速部署基于 fastify.js 的后端服务到腾讯云函数的组件
- [@twn39/tencent-php-slim](https://github.com/twn39/tencent-php-slim) - 快速部署基于 Slim PHP 微框架的后端服务到腾讯云函数的组件

此外，所有的 Serverless Components 均可在 [Github 仓库](https://github.com/serverless-components/) 中查看。
