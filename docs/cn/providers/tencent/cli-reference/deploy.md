<!--
title: Serverless Framework 文档 - 部署服务
menuText: 部署服务
menuOrder: 5
description: Deploy your service to the specified provider
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/deploy/)

<!-- DOCS-SITE-LINK:END -->

## 简介
您可以使用`sls deploy`命令部署您的整个服务，当您的服务架构有更新时（例如，修改了 serverless.yaml）您可执行该命令。如果您的云函数代码有变更，您想快速上传或者您想更新云函数配置，您可以使用`serverless deploy function -f myFunction` 命令。
```
$ serverless deploy
```

>- 执行`serverless deploy`后，Serverless Framework 会先执行 `serverless package`然后进行部署。
>- 部署时，会在您的账号下自动生成 [COS Bucket](https://console.cloud.tencent.com/cos5/bucket) 并存储部署包。


#### 参数说明

- `--config`或`-c` ：自定义配置文件名（除`serverless.yml.yaml|.js|.json`之外）。
- `--stage`或 `-s`：目标部署环境，默认为`dev`。
- `--region`或`-r`：目标部署区域，默认为 `ap-guangzhou`。
- `--package`或`-p`：自定义部署包路径，指定后将跳过打包步骤。
- `--force`：强制部署，升级情况下，默认升级代码和配置，触发器默认不升级。加了--force参数会进行触发器的升级。
- `--function`或`-f` 执行`deploy function`，不可以和`--package`共用。




## 示例

- **默认部署**
执行以下命令，将会部署至 stage（dev）和 region（ap-guangzhou）。
```
$ serverless deploy
```





- **指定区域和环境**
执行以下命令，将会部署至 stage（pro）和 region（ap-shanghai）。
```
$ serverless deploy --stage pro --region ap-shanghai
```





- **指定部署包**
执行以下命令，将会跳过打包步骤，使用`/path/to/package/directory`下的部署包进行部署。
```
$ serverless deploy --package /path/to/package/directory
```


