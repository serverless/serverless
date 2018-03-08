<!--
title: Serverless Getting Started Guide
menuText: Getting Started
layout: Doc
menuOrder: 0
menuItems:
  - {menuText: AWS Guide, path: /framework/docs/providers/aws/guide/quick-start}
  - {menuText: Azure Functions Guide, path: /framework/docs/providers/azure/guide/quick-start}
  - {menuText: OpenWhisk Guide, path: /framework/docs/providers/openwhisk/guide/quick-start}
  - {menuText: Google Functions Guide, path: /framework/docs/providers/google/guide/quick-start}
  - {menuText: Kubeless Guide, path: /framework/docs/providers/kubeless/guide/quick-start}
  - {menuText: Spotinst Guide, path: /framework/docs/providers/spotinst/guide/quick-start}
  - {menuText: Webtasks Guide, path: /framework/docs/providers/webtasks/guide/quick-start}
-->

# Getting Started with Serverless

First things first, let's get the Serverless framework installed on your machine.

```bash
# Installing the serverless cli
npm install -g serverless
# Updating serverless from a previous version of serverless
npm install -g serverless
# Login to the serverless platform (optional)
serverless login
```

Next up, it's time to choose where you'd like your serverless service to run.

## Choose your compute provider

<div class="docsSections">
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/aws/guide/quick-start">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/aws-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/aws/guide/quick-start">Amazon Web Services<br/>Quick Start Guide</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/azure/guide/quick-start">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/azure-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/azure/guide/quick-start">Azure Functions<br/>Quick Start Guide</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/openwhisk/guide/quick-start">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/openwhisk-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/openwhisk/guide/quick-start">Apache OpenWhisk <br/>Quick Start Guide</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/google/guide/quick-start">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/gcf-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/google/guide/quick-start">Google Cloud Functions<br/>Quick Start Guide</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/kubeless/guide/quick-start">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/kubeless-logos-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/kubeless/guide/quick-start">Kubeless<br/>Quick Start Guide</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/spotinst/guide/quick-start">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/spotinst-logos-black-small.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/spotinst/guide/quick-start">Spotinst<br/>Quick Start Guide</a>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="/framework/docs/providers/webtasks/guide/quick-start">
        <img src="  https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/webtask-small-grayscale.png" width="250" draggable="false"/>
      </a>
    </div>
    <div style="text-align:center;">
      <a href="/framework/docs/providers/webtasks/guide/quick-start">Webtasks<br/>Quick Start Guide</a>
    </div>
  </div>

</div>
