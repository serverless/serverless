<!--
title: Serverless - Components 最佳实践
menuText: Components 最佳实践
layout: Doc
-->

# Components 最佳实践

**Serverless Components** 是 **[Serverless Framework](https://github.com/serverless/serverless/blob/master/README_CN.md)** 重磅推出的基础设置编排能力，支持开发者通过 **Serverless Components** 构建，组合并部署你的 Serverless 应用。

- - [x] **快速部署 -** Components 支持极速部署 Serverless 架构和应用
- - [x] **全面覆盖 -** 既能支持基础设施的 Components，也可以支持更高维度的，场景级别的 Components。
- - [x] **轻松复用 -** 你构建的每个 Component 都可复用，并且对外发布后，也可以支持他人使用。
- - [x] **灵活组合 -** 可以通过 YAML 或者 Javascript 灵活组合不同的 Components。

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

#### [部署其他模板](https://github.com/serverless/components/tree/v1/templates)

在这里查看所有预设的 [Components 模板](https://github.com/serverless/components/tree/v1/templates)，你可以通过这些模板方便的部署*REST API*， 网站, *定时任务*等多种场景。每个模板都提供了清晰的 `README.md` 来说明怎样使用。
