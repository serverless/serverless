<!--
title: Serverless - Tencent SCF - Components 概述
menuText: Components 概述
layout: Doc
menuItems:
  - {menuText: 基础 Components , path: /framework/docs/providers/tencent/components/basic-components}
  - {menuText: Components 最佳实践, path: /framework/docs/providers/tencent/components/high-level-components}
-->

Serverless Components 是支持多个云资源编排和组织的场景化解决方案，主要基于客户的具体场景，如 Express 框架支持、网站部署等。Serverless Components 可以有效简化云资源的配置和管理，将网关、COS 和 CAM 等产品联动起来，让客户更多关注场景和业务。

## 优势特性

**Serverless Components** 是 **[Serverless Framework](https://github.com/serverless/serverless/blob/master/README_CN.md)** 重磅推出的基础设置编排能力，支持开发者通过 **Serverless Components** 构建，组合并部署你的 Serverless 应用。

- - [x] **快速部署 -** Components 支持极速部署 Serverless 架构和应用
- - [x] **全面覆盖 -** 既能支持基础设施的 Components，也可以支持更高维度的，场景级别的 Components。
- - [x] **轻松复用 -** 你构建的每个 Component 都可复用，并且对外发布后，也可以支持他人使用。
- - [x] **灵活组合 -** 可以通过 YAML 或者 Javascript 灵活组合不同的 Components。

下面通过一个 Serverless Framework 使用 Components 的例子，可以看出 Component 多么易用：

```yaml
# serverless.yml
name: website

website:
  component: '@serverless/tencent-website'
  inputs:
    code:
      src: ./src
      # hook: npm run build
      # domain: www.serverlesscomponents.com
```

## 快速开始

通过 NPM 安装 [Serverless Framework](https://www.github.com/serverless/serverless) ：

```console
$ npm i -g serverless
```

**确保你使用的是 Serverless Framework 1.49 及以上的版本**。更早的版本无法支持 Serverless Components Beta。

之后，通过 `create --template-url` 命令安装一个 [Serverless Components 模板](./templates)，模板中会包含了 Componenets 及示例代码，可以让你更快的了解 Component。

以下是一些常用的用例模板：

#### [部署 Hexo 静态博客](./tencent-hexo.md)

通过 Serverless Website 组件快速构建一个 Serverless Hexo 站点

```shell
serverless create --template-url https://github.com/serverless/components/tree/v1/templates/tencent-hexo-blog
```

#### [快速构建 REST API](./tencent-rest-api.md)

通过 Serverless SCF 组件快速构建一个 REST API 应用，实现 GET/PUT 操作。

```shell
serverless create --template-url https://github.com/serverless/components/tree/v1/templates/tencent-python-rest-api
```

#### [部署 Serverless 全栈 WEB 应用（React.js）](./tencent-react-full-stack.md)

本示例以 React 为前端，Express 框架作为后端，通过多个 Serverless Components 部署 Serverless 全栈应用程序。

```shell
serverless create --template-url https://github.com/serverless/components/tree/v1/templates/tencent-fullstack-react-application
```

#### [部署 Serverless 全栈 WEB 应用（Vue.js）](./tencent-vue-full-stack.md)

本示例以 Vue 为前端，Express 框架作为后端，通过多个 Serverless Components 部署 Serverless 全栈应用程序。

```shell
serverless create --template-url https://github.com/serverless/components/tree/v1/templates/tencent-fullstack-vue-application
```

#### [部署其他模板](./templates)

在这里查看所有预设的 [Components 模板](https://github.com/serverless/components/tree/v1/templates)，你可以通过这些模板方便的部署*REST API*， 网站, *定时任务*等多种场景。每个模板都提供了清晰的 `README.md` 来说明怎样使用。

#### Serverless Components 列表

如下所示，当前 Serverless Components 支持丰富的多语言开发框架和应用：

**基础组件**：

- [@serverless/tencent-postgresql](https://github.com/serverless-components/tencent-postgresql) - 腾讯云 PG DB Serverless 数据库组件
- [@serverless/tencent-apigateway](https://github.com/serverless-components/tencent-apigateway) - 腾讯云 API 网关组件
- [@serverless/tencent-cos](https://github.com/serverless-components/tencent-cos) - 腾讯云对象存储组件
- [@serverless/tencent-scf](https://github.com/serverless-components/tencent-scf) - 腾讯云云函数组件
- [@serverless/tencent-cdn](https://github.com/serverless-components/tencent-cdn) - 腾讯云 CDN 组件
- [@serverless/tencent-cam-role](https://github.com/serverless-components/tencent-cam-role) - 腾讯云 CAM 角色组件
- [@serverless/tencent-cam-policy](https://github.com/serverless-components/tencent-cam-policy) - 腾讯云 CAM 策略组件
- [@serverless/tencent-vpc](https://github.com/serverless-components/tencent-vpc) - 腾讯云 VPC 私有网络组件
- [@serverless/tencent-ssl](https://github.com/serverless-tencent/tencent-ssl) - 腾讯云 SSL 证书组件

**高阶组件**：

- [@serverless/tencent-nextjs](https://github.com/serverless-components/tencent-nextjs) - 快速部署基于 Next.js 框架到腾讯云函数的组件
- [@serverless/tencent-nuxtjs](https://github.com/serverless-components/tencent-nuxtjs) - 快速部署基于 Nuxt.js 框架到腾讯云函数的组件
- [@serverless/tencent-express](https://github.com/serverless-components/tencent-express) - 快速部署基于 Express.js 的后端服务到腾讯云函数的组件
- [@serverless/tencent-egg](https://github.com/serverless-components/tencent-egg) - 快速部署基于 Egg.js 的后端服务到腾讯云函数的组件
- [@serverless/tencent-koa](https://github.com/serverless-components/tencent-koa) - 快速部署基于 Koa.js 的后端服务到腾讯云函数的组件
- [@serverless/tencent-flask](https://github.com/serverless-components/tencent-flask) - 腾讯云 Python Flask RESTful API 组件
- [@serverless/tencent-django](https://github.com/serverless-tencent/tencent-django) - 腾讯云 Python Django RESTful API 组件
- [@serverless/tencent-tornado](https://github.com/serverless-tencent/tencent-tornado) - 腾讯云 Python Tornado RESTful API 组件
- [@serverless/tencent-pyramid](https://github.com/serverless-tencent/tencent-pyramid) - 腾讯云 Python Pyramid RESTful API 组件
- [@serverless/tencent-bottle](https://github.com/serverless-tencent/tencent-bottle) - 腾讯云 Python Bottle RESTful API 组件
- [@serverless/tencent-laravel](https://github.com/serverless-components/tencent-laravel) - 腾讯云 PHP Laravel RESTful API 组件
- [@serverless/tencent-thinkphp](https://github.com/serverless-components/tencent-thinkphp) - 腾讯云 ThinkPHP RESTful API 组件
- [@serverless/tencent-website](https://github.com/serverless-components/tencent-website) - 快速部署静态网站到腾讯云的组件
- [@serverless/serverless-global](https://github.com/serverless-tencent/serverless-global) - 管理全局变量的组件

**第三方贡献**：

- [@authing/serverless-oidc](https://github.com/Authing/serverless-oidc) - 快速部署基于 Authing 的身份认证组件
- [@twn39/tencent-fastify](https://github.com/twn39/tencent-fastify) - 快速部署基于 fastify.js 的后端服务到腾讯云函数的组件
- [@twn39/tencent-php-slim](https://github.com/twn39/tencent-php-slim) - 快速部署基于 Slim PHP 微框架的后端服务到腾讯云函数的组件

[![Serverless Components Tencent](https://main.qcloudimg.com/raw/b6310fa4290e6fed60b137ff95f4b577.png)](https://github.com/serverless-components/)
