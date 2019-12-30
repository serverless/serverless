<!--
title: Serverless Framework 文档 - 部署列表
menuText: 部署列表
menuOrder: 7
description: List your previous CloudFormation deployments
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/deploy-list/)

<!-- DOCS-SITE-LINK:END -->

## 简介

您可以使用`sls deploy list [function]`命令查询您的部署信息。
- 如果想要查看您 COS Bucket 里的部署包信息，可以执行`serverless deploy list`；
- 如果您想要查看已经部署的云函数信息，可以执行`serverless deploy list functions`。

这些部署展示信息在您想要使用回滚功能`serverless rollback`时会用到。




#### 参数说明

- `--stage`或`-s`：目标部署环境，默认为`dev`。
- `--region`或`-r`：目标部署区域，默认为`ap-guangzhou`。



## 示例

- **部署列表**
执行以下命令，您可以获取 COS Bucket 里的部署包信息。
```
$ serverless deploy list
```



- **部署函数列表**
执行以下命令，您可以获取已部署的函数名和版本信息。
```
$ serverless deploy list functions
```

