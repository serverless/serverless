<!--
title: Serverless Framework 文档 - 日志查看
menuText: 日志查看
menuOrder: 10
description: View logs of your Tencent-SCF function within your terminal using the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/logs/)

<!-- DOCS-SITE-LINK:END -->

## 简介
Serverless Framework 支持查看云端函数运行日志。

```
$ serverless logs -f hello

# 查看实时最新日志可以追加参数 -t
$ serverless logs -f hello -t
```



#### 参数说明

- `--function`或`-f`：已部署的云函数名，必填。
- `--stage`或`-s`：目标部署环境，如果未指定，则会读取`serverless.yaml`里的`stage`信息，如果没有，则默认为`dev`。
- `--region`或`-r`：目标部署区域，如果未指定，则会读取`serverless.yaml`里的`region`信息，如果没有，默认为`ap-guangzhou`。
- `--startTime`：日志开始时间 ，如`"2019-7-12 00:00:00"`。
- `--tail`或`-t`：实时获取最新日志。
- `--interval`：日志输出间隔，当您启用了 tail 功能，您可以控制日志输出频率，默认是1000ms。


## 示例

- **获取默认日志**
执行以下命令，获取云函数`hello`最近10分钟的调用日志。
```
$ serverless logs -f hello
```



- **实时日志**
执行以下命令，获取10秒前的日志，并每10秒更新一次日志。
```
$ serverless logs -f hello -t
```
