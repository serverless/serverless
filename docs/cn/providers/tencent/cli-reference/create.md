<!--
title: Serverless Framework 文档 - 部署创建
menuText:  部署创建
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/tencent/cli-reference/create/)

<!-- DOCS-SITE-LINK:END -->

## 操作场景
该任务指导您通过两种方式，在本地创建 Serverless 示例模板。

## 操作步骤
- 在当前目录创建一个示例模板：
```
$ serverless create --template tencent-nodejs
```
创建完成后，将会在当前目录生成示例代码`index.js`和应用描述文件`serverless.yml` 。

- 在指定目录创建示例模板：
```
$ serverless create --template tencent-nodejs --path my-service
```


#### 参数说明
- `--template`  或 `-t`  为模版文件名，必填。
- `--path` 或 `-p` 为目标目录。
- `--name`或`-n` serverless.yml 里 service 名。


#### 可用模板
当前已支持的模板列表 ：tencent-go、tencent-nodejs、tencent-python、tencent-php。

#### 示例
创建新服务 ：
```
$ serverless create --template tencent-nodejs --name test
```
在当前文件夹下创建模板服务并命名为“test”，运行时为 nodejs。





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

