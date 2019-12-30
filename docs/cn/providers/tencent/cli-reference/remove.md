<!--
title: Serverless Framework 文档 - 删除服务
menuText: 删除服务
menuOrder: 16
description: Remove a deployed Service and all of its Tencent-SCF Functions, Events and Resources
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/remove/)

<!-- DOCS-SITE-LINK:END -->

## 简介
您可以使用`sls remove`命令删除您部署的服务。
```
$ serverless remove
```


#### 参数说明
- `--stage`或 `-s`：目标部署环境，默认为`dev`。
- `--region`或`-r`：目标部署区域，默认为 `ap-guangzhou`。


## 示例

#### 删除指定环境和区域的服务
执行以下命令，删除当前工作区定义的已部署至 stage（dev）和 region（ap-guangzhou）的服务。
```
$ serverless remove --stage dev --region ap-guangzhou
```