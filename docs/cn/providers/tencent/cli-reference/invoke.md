<!--
title: Serverless Framework 文档 - 云端调用
menuText: 云端调用
menuOrder: 6
description: Invoke a Tencent-SCF function using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/invoke/)

<!-- DOCS-SITE-LINK:END -->


## 简介
Serverless Framework 调用已部署的云函数，支持发送测试数据到云函数，返回函数日志并展示其他调用关键信息。
```
$ serverless invoke --function functionName
```

#### 参数说明
- `--function` 或 `-f`：已部署到云函数名，必填。
- `--stage`或 `-s`：目标部署环境，默认为`dev`。
- `--region`或`-r`：目标部署区域，默认为`ap-guangzhou`。




## 示例

**调用指定函数**
执行以下命令，调用已部署至广州区域的`dev`环境下的`functionName`函数，调用结果将输出至终端。
```
$ serverless invoke --function functionName --stage dev --region ap-guangzhou
```





