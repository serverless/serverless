<!--
title: Serverless Framework 文档 - Tencent-SCF - 部署函数
menuText: 部署函数
menuOrder: 4
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/deploy-function/)

<!-- DOCS-SITE-LINK:END -->

## 简介

您可以使用`sls deploy function`命令部署您的某个云函数，当您的云函数代码有变更，需要快速上传或者更新云函数配置时，可以使用该命令。

```
$ serverless deploy function -f functionName
```



#### 参数说明

- `--function`或`-f`：部署函数名。
- `--stage`或`-s`：目标部署环境，默认为`dev`。
- `--region`或`-r`：目标部署区域，默认为`ap-guangzhou`。



## 示例

- **默认部署**
执行以下命令，将会部署函数至 stage（dev）和 region（ap-guangzhou）。
```
$ serverless deploy function --function helloWorld
```





- **指定区域和环境**
执行以下命令，将会部署至 stage（pro）和 region（ap-shanghai）。
```
$ serverless deploy function --function helloWorld --stage pro --region ap-shanghai
```



