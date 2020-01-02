<!--
title: Serverless Framework - Tencent-SCF 事件 - Timer
menuText: Timer
menuOrder: 9
description:  Setting up Timer Events with Tencent-SCF via the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/events/timer/)

<!-- DOCS-SITE-LINK:END -->

## 定时触发事件定义

如下配置将为 `hello_world` 函数创建一个每 5 秒执行一次的定时触发器。当前一个函数可以创建多个定时触发器。此外，您可以使用标准的 Cron 表达式的形式自定义何时触发。详情可以参考 [定时触发器概述](https://cloud.tencent.com/document/product/583/9708)。

```yaml
functions:
  hello_world:
    handler: index.main_handler
    runtime: Nodejs8.9

    events:
      - timer:
          name: timer
          parameters:
            cronExpression: '*/5 * * * *'
            enable: true
```

## 开启/关闭定时触发器

如下例子将会为 `function_two` 函数创建一个默认关闭的定时触发器，如果 `enable` 参数设置为 `true`，则该函数会每 1 分钟触发一次。

```yaml
functions:
  function_two:
    handler: index.main_handler
    runtime: Nodejs8.9

    events:
      - timer:
          name: timer
          parameters:
            cronExpression: '0 */1 * * *'
            enable: false
```

> 注：定时触发器默认开启。

## 定时触发器名称

名称可以唯一确定一个函数的定时触发器，如下配置所示：

```yaml
events:
  - timer:
      name: your-timer-name
```

## 定时触发器入参说明

定时触发器在触发函数时，会把如下的数据结构封装在 event 里传给云函数。同时，定时触发器支持自定义传入 Message，缺省为空。

```json
{
  "Type": "timer",
  "TriggerName": "EveryDay",
  "Time": "2019-02-21T11:49:00Z",
  "Message": "user define msg body"
}
```
