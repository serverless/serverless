[![Serverless Application Framework Tencent Cloud](https://img.serverlesscloud.cn/20191216/1576510505204-readme-serverless-framework.gif)](http://serverless.com)

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://github.com/serverless/serverless/workflows/Integrate/badge.svg)](https://github.com/serverless/serverless/actions?query=workflow%3AIntegrate)
[![npm version](https://badge.fury.io/js/serverless.svg)](https://badge.fury.io/js/serverless)
[![codecov](https://codecov.io/gh/serverless/serverless/branch/master/graph/badge.svg)](https://codecov.io/gh/serverless/serverless)
[![gitter](https://img.shields.io/gitter/room/serverless/serverless.svg)](https://gitter.im/serverless/serverless)
[![Known Vulnerabilities](https://snyk.io/test/github/serverless/serverless/badge.svg)](https://snyk.io/test/github/serverless/serverless)
[![license](https://img.shields.io/npm/l/serverless.svg)](https://www.npmjs.com/package/serverless)

<p align="center">
  <span>简体中文</span> |
  <a href="./README.md">English</a>
</p>

[官网](http://www.serverless.com) • [文档](https://serverless.com/framework/docs/) • [中文社区](https://serverlesscloud.cn/) • [思否](https://segmentfault.com/t/serverlessframework) • [中文论坛(即将上线)](http://forum.serverless.com) • [体验 Pro 版本](https://dashboard.serverless.com)

**The Serverless Framework** ——快速部署你的 Serverless 应用，支持事件触发，弹性扩缩容，并且按需付费。从而大大降低构建和维护应用的开销，供开发者专注业务逻辑。

Serverless Framework 是一个命令行工具，它使用基于事件触发的计算资源，例如腾讯云云函数 SCF，AWS Lambda 等。此外，Serverless Framework 为开发和部署 Serverless 架构提供脚手架，自动化工作流以及最佳实践。并且它支持通过丰富的插件进行功能扩展。

Serverless 是一个遵循 MIT 协议的开源项目，并且由全职的，有投资者支持的创业团队积极的维护。

<!--
<a href="https://www.youtube.com/watch?v=-Nf0ui3qP2E" target="_blank">Serverless Framework 入门视频</a>
-->

点击下图了解 [Serverless Components](https://github.com/serverless/components/blob/master/README.cn.md)
[![serverless components notice](https://img.serverlesscloud.cn/20191216/1576511681715-announcement-serverless-components-3.gif)](https://github.com/serverless/components/blob/master/README.cn.md)

## Serverless Framework 介绍

<img align="right" width="400" src="https://img.serverlesscloud.cn/20191217/1576576146419-quick-start-gif.gif" />

- [快速开始](#quick-start)
- [例子](https://github.com/serverless/examples)
- [服务](#services)
- [特性](#features)
- [插件](https://github.com/serverless/plugins)
- [贡献](#contributing)
- [开发者社区](#community)
- [协议](#licensing)

## <a name="quick-start"></a>快速开始

[查看这里的动图](https://serverless.com/framework/) 或者跟着如下步骤，3 分钟创建并且部署你的第一个 Serverless 应用。

1. **npm 安装：**

```bash
npm install -g serverless
```

2. **创建一个服务：**

你可以创建一个新的服务，或者根据模板[创建已有服务](#how-to-install-a-service)。

```bash
# 创建一个新的 Serverless 服务/项目
serverless create --template tencent-nodejs --path my-service
# 进入到创建好的项目目录
cd my-service
```

3. **部署服务：**

当你修改了 `serverless.yml` 文件中关于函数、事件或者其他资源的配置时，或者你只是希望把服务的更改都更新到云端时，可以使用以下命令进行部署：

```bash
serverless deploy -v
```

4. **部署函数：**

通过如下命令快速部署并且覆盖云端的 SCF 云函数，并且部署单个函数的速度更快。

```bash
serverless deploy function -f hello_world
```

5. **云端触发函数：**

触发腾讯云云函数 SCF 并且获取实时日志返回：

```bash
serverless invoke -f hello_world -l
```

6. **获取函数日志：**

单独打开一个命令行，通过如下命令可以实时展示对某个函数的调用日志：

```bash
serverless logs -f hello_world -t
```

7. **移除服务：**

从云端账号中移除所有的函数、事件以及资源。

```bash
serverless remove
```

8. **账号配置（可选）：**

当前支持微信扫码登录授权，可以方便的进行账号 [登录](https://cloud.tencent.com/login) 或 [注册](https://cloud.tencent.com/register)。如您希望配置持久的环境变量/密钥信息，也可以参考 [配置账号](https://serverlesscloud.cn/doc/providers/tencent/cli-reference/configure) 文档。

### 怎样安装已有服务：

当前支持通过下列命令方便、快速的将您所需的 Serverless 服务模板从 Github 上下载到本地并解压，目前支持如下的一些案例：

```bash
serverless install -u https://github.com/your-url-to-the-serverless-service
```

## <a name="services"></a>服务 (V1.0)

通过 `serverless install --url <service-github-url>` 你可以立即部署并使用如下几个服务：

- [自动文本摘要](https://github.com/serverless-tencent/Plugin-Example/tree/master/TextSummarization) - 通过该例子实现自动文本摘要
- [建立 Serverless 网站](https://github.com/serverless-tencent/Plugin-Example/tree/master/WebsitePage) - 通过云函数和网关实现 Serverless 网站
- [Node.js RESTful API](https://github.com/serverless-tencent/Plugin-Example/tree/master/tencent-nodejs-rest-api) - 通过 Node.js 实现 RESTful API

**注意**：`serverless install` 命令在 V1.0 版本后才生效

## <a name="features"></a>特性

- 支持 Node.js, Python, Java, Go,和 PHP 等语言
- 全生命周期的 Serverless 应用管理（构建，部署，更新，删除）
- 通过云厂商提供的能力，安全、快速的部署函数、事件和相关资源
- 通过服务的维度对函数分组，更好的管理代码、函数和部署流程，支持大型项目开发和跨团队的协作。
- 极简配置，提供完整的脚手架
- 内置多个阶段的支持，方便环境隔离
- 针对 CI/CD 工作流进行了优化
- 自动化、部署速度优化、并提供最佳实践
- 100% 可扩展：支持通过插件扩展或者修改 Serverless Framework
- 良好的 Serverless 插件，服务和组件的生态
- 积极热情的社区！

## <a name="contributing"></a> 欢迎贡献

我们非常欢迎开发者对项目进行贡献！可以了解我们的[贡献提交指南](CONTRIBUTING.md) 并且了解怎样向 Serverless Framework 提交贡献。

欢迎查看我们的 [help wanted](https://github.com/serverless/serverless/labels/help%20wanted) 或者 [good first issue](https://github.com/serverless/serverless/labels/good%20first%20issue) 标签的 issue 列表，我们诚邀各位开发者参与和贡献，一起推动解决这些问题！

## <a name="community"></a> 开发者社区

- [中文技术社区](https://serverlesscloud.cn/)
- [知乎专栏](https://zhuanlan.zhihu.com/ServerlessGo)
- [SegmentFault](https://segmentfault.com/t/serverlessframework)
- [Serverless 开发资源汇总](https://github.com/yugasun/awesome-serverless-framework)
- 交流 QQ 群：871445853
- 微信社区群：serverlesscloud （加小助手拉群）

## <a name="licensing"></a>协议

Serverless 是一个遵循 [MIT 协议](./LICENSE.txt)的开源项目。

Serverless Framework 使用的 node_modules 以及其他第三方的依赖库都可能有其遵循的协议，我们推荐你阅读并了解这些协议，因为其中的条款可能和 MIT 协议中的不完全相同。
