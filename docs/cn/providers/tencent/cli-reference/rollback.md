<!--
title: Serverless CLI 回滚服务
menuText: 回滚服务
menuOrder: 14
description: Rollback the Serverless service to a specific deployment
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/rollback/)

<!-- DOCS-SITE-LINK:END -->

## 简介
Serverless Framework 可以回滚已部署的服务版本。
```
$ serverless rollback --timestamp timestamp
```

执行回滚前可以通过`sls rollback -v`获取已部署的历史版本时间戳。

#### 参数说明
- `--timestamp`或`-t`：已部署的历史版本时间戳。
- `--verbose`或`-v`：获取历史部署版本。



## 示例

您可以先执行`sls rollback -v` 获取您在 COS 里的历史部署版本，然后指定某一版本进行回滚。
```
$ sls rollback -v
$ sls rollback -t 1571240207
```

