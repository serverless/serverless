<!--
title: Serverless Framework 文档 - 获取信息
menuText: 获取信息
menuOrder: 13
description: Display information about your deployed service and the Serverless Cloud Function, Events and Tencent Cloud Resources it contains.
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/info/)

<!-- DOCS-SITE-LINK:END -->

## 简介
您可以通过 Serverless Framework 查看云端已部署服务的详细信息，包括环境、区域和函数列表。
```
$ serverless info
```



#### 参数说明

- `--stage`或`-s`：目标部署环境，如果未指定，则会读取`serverless.yaml`里的`stage`信息，如果没有，则默认为`dev`。
- `--region`或`-r`：目标部署区域，如果未指定，则会读取`serverless.yaml`里的`region`信息，如果没有，默认为`ap-guangzhou`。



## 示例

>!函数调用和运行数据生成之间会有一些延时，函数调用之后几秒才能获取对应数据。

- **获取默认运行数据**
执行以下命令，获取服务最近24小时运行数据统计。
```
$ serverless metrics
```



-  **获取指定时段运行数据**
执行以下命令，获取 2019-01-01 至 2019-01-02 的服务运行数据。
```
$ serverless metrics --startTime 2019-01-01 --endTime 2019-01-02
```



- **获取函数运行数据**
执行以下命令，获取最近24小时的函数`hello`运行数据。
```
$ serverless metrics --function hello
```



- **获取指定时段函数运行数据**
执行以下命令，获取 2019-01-01 至 2019-01-02 的函数`hello`运行数据。
```
$ serverless metrics --function hello --startTime 2019-01-01 --endTime 2019-01-02
```



