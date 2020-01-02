<!--
title: Serverless - CLI 命令行工具
menuText: CLI 命令行工具
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Infrastructure Providers

提供多种 CLI 框架选择

<div class="providersSections">
  <a href="./tencent/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/tencent-cloud-logo.png" width="250" draggable="false" class='tencent-logo'/>
    </div>
  </div>
  </a>
</div>
<br/>
<br/>

## Connecting your provider

To deploy functions, specify your provider in your service's `serverless.yml` file under the `provider` key and make sure your provider credentials are setup on your machine or CI/CD system.

```yml
# serverless.yml
service: my-service-name

provider:
  name: tencent
```
