<!--
title: Serverless - CLI 命令行工具
menuText: CLI 命令行工具
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/)

<!-- DOCS-SITE-LINK:END -->

# Serverless Infrastructure Providers

提供多种CLI框架选择

<div class="providersSections">
  <a href="./aws/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/aws-logo.svg" width="250" draggable="false" class='aws-logo' />
    </div>
  </div>
  </a>
  <a href="./azure/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/azure-logo.svg" width="250" draggable="false" class='azure-logo'/>
    </div>
  </div>
  </a>
  <a href="./tencent/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/tencent-cloud-logo.png" width="250" draggable="false" class='tencent-logo'/>
    </div>
  </div>
  </a>
  <a href="./google/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/google-logo.png" width="250" draggable="false" class='google-logo'/>
    </div>
  </div>
  </a>
  <a href="./knative/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/knative-logo.svg" width="250" draggable="false" class='knative-logo'/>
    </div>
  </div>
  </a>
  <a href="./aliyun/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/alibaba-cloud-logo-gray.png" width="250" draggable="false" class='aliyun-logo'/>
    </div>
  </div>
  </a>
  <a href="./cloudflare/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/cloudflare-logo.svg" width="250" draggable="false" class='cloudflare-logo'/>
    </div>
  </div>
  </a>
  <a href="./fn/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/fn-logo.svg" width="250" draggable="false" class='fn-logo'/>
    </div>
  </div>
  </a>
  <a href="./kubeless/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/kubeless-logo.svg" width="250" draggable="false" class='kubeless-logo'/>
    </div>
  </div>
  </a>
  <a href="./openwhisk/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/openwhisk-logo.svg" width="250" draggable="false" class='openwhisk-logo'/>
    </div>
  </div>
  </a>
  <a href="./spotinst/">
  <div class="providerSection">
    <div class="providerSectionHeader">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/docs/spotinst-logo.svg" width="250" draggable="false" class='spotinst-logo'/>
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
  name: aws
```
