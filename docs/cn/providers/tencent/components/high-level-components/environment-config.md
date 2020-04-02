<!--
title: Serverless Framework - Components 最佳实践 - 环境变量管理最佳实践
menuText: 环境变量管理最佳实践
menuOrder: 5
layout: Doc
-->

## 使用 serverless-global 组件进行全局变量管理

在使用 Serverless Components 时，会遇到配置一些全局变量。例如对于多个函数，需要配置相同的数据库等信息时，可以通过如下 serverless-global 组件进行变量的复用和管理。

使用方式如下，首先在 Yaml 中增加全局配置的字段，然后在对应的 Components 中直接通过 `${Conf.mysql_host}`的方式引用即可。

```yaml
Conf:
  component: 'serverless-global'
  inputs:
    mysql_host: gz-cdb-mytest.sql.tencentcdb.com
    mysql_user: mytest
    mysql_password: mytest
    mysql_port: 62580
    mysql_db: mytest
    mini_program_app_id: mytest
    mini_program_app_secret: mytest

Album_Login:
  component: '@serverless/tencent-scf'
  inputs:
    name: Album_Login
    codeUri: ./album/login
    handler: index.main_handler
    runtime: Python3.6
    region: ap-shanghai
    environment:
      variables:
        mysql_host: ${Conf.mysql_host}
        mysql_port: ${Conf.mysql_port}
        mysql_user: ${Conf.mysql_user}
        mysql_password: ${Conf.mysql_password}
        mysql_db: ${Conf.mysql_db}
```
