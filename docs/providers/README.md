<!--
title: Serverless - Infrastructure & Compute Providers
menuText: Providers
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/)
<!-- DOCS-SITE-LINK:END -->

# Serverless Infrastructure Providers

Under the hood, the serverless framework is deploying your code to a cloud provider like AWS, Microsoft Azure, Apache OpenWhisk or Google Cloud functions.

<div class="docsSections">
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./aws/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/aws-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./aws/">AWS Docs</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./azure/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/azure-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./azure/">Azure Functions Docs</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./openwhisk/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/openwhisk-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./openwhisk/">OpenWhisk Docs</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./google/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/gcf-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./google/">Cloud Functions Docs</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./kubeless/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/kubeless-logos-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./kubeless/">Kubeless Docs</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./spotinst/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/spotinst-logos-black-small.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./spotinst/">Spotinst Docs</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./webtasks/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/webtask-small-grayscale.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="./webtasks/">Auth0 Webtasks Docs</a>
    </div>
  </div>

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
