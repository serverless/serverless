<!--
title: Serverless Framework Documentation
menuText: Docs
layout: Doc
menuItems:
  - {menuText: "Getting Started", path: /framework/docs/getting-started/}
  - {menuText: Providers, path: /framework/docs/providers}
  - {menuText: "- AWS", path: /framework/docs/providers/aws/}
  - {menuText: "- Azure", path: /framework/docs/providers/azure/}
  - {menuText: "- fn", path: /framework/docs/providers/fn/}
  - {menuText: "- Google", path: /framework/docs/providers/google/}
  - {menuText: "- OpenWhisk", path: /framework/docs/providers/openwhisk/}
  - {menuText: "- Kubeless" , path: /framework/docs/providers/kubeless/}
  - {menuText: "- Spotinst" , path: /framework/docs/providers/spotinst/}
  - {menuText: "- Cloudflare" , path: /framework/docs/providers/cloudflare/}
  - {menuText: Enterprise, path: https://www.github.com/serverless/enterprise}
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/)

<!-- DOCS-SITE-LINK:END -->

# Documentation

The Serverless Framework is a CLI tool that allows users to build & deploy auto-scaling, pay-per-execution, event-driven functions.

Write your code, configure events to trigger your functions, then deploy & run those functions to your [cloud provider](#Supported-Providers) via the **Serverless CLI**.

Getting started with serverless? **[Start here](./getting-started.md)**.

Already using AWS or another cloud provider? Read on.

## Serverless Cloud Providers

<div class="docsSections">
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/aws/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/aws-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/aws/guide/quick-start.md">AWS QuickStart</a></li>
        <li><a href="./providers/aws/guide">Guide</a></li>
        <li><a href="./providers/aws/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/aws/events">Events</a></li>
        <li><a href="./providers/aws/examples">Examples</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/azure/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/azure-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/azure/guide/quick-start.md">Azure QuickStart</a></li>
        <li><a href="./providers/azure/guide">Guide</a></li>
        <li><a href="./providers/azure/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/azure/events">Events</a></li>
        <li><a href="./providers/azure/examples">Examples</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/openwhisk/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/openwhisk-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/openwhisk/guide/quick-start">OpenWhisk QuickStart</a></li>
        <li><a href="./providers/openwhisk/guide">Guide</a></li>
        <li><a href="./providers/openwhisk/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/openwhisk/events">Events</a></li>
        <li><a href="./providers/openwhisk/examples">Examples</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/google/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/images/gcf-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/google/guide/quick-start">Google CF QuickStart</a></li>
        <li><a href="./providers/google/guide">Guide</a></li>
        <li><a href="./providers/google/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/google/events">Events</a></li>
        <li><a href="./providers/google/examples">Examples</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/kubeless/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/kubeless-logos-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/kubeless/guide/quick-start">Kubeless QuickStart</a></li>
        <li><a href="./providers/kubeless/guide">Guide</a></li>
        <li><a href="./providers/kubeless/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/kubeless/events">Events</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/spotinst/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/spotinst-logos-black-small.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/spotinst/guide/quick-start">Spotinst QuickStart</a></li>
        <li><a href="./providers/spotinst/guide">Guide</a></li>
        <li><a href="./providers/spotinst/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/spotinst/events">Events</a></li>
        <li><a href="./providers/spotinst/examples">Examples</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/fn/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/fn-logo-black.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/fn/guide/quick-start">Fn QuickStart</a></li>
        <li><a href="./providers/fn/guide">Guide</a></li>
        <li><a href="./providers/fn/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/fn/events">Events</a></li>
      </ul>
    </div>
  </div>
  <div class="docsSection">
    <div class="docsSectionHeader">
      <a href="./providers/cloudflare/">
        <img src="https://s3-us-west-2.amazonaws.com/assets.site.serverless.com/docs/cloudflare/cf-logo-v-dark-gray.png" width="250" draggable="false"/>
      </a>
    </div>
    <div>
      <ul>
        <li><a href="./providers/cloudflare/guide/quick-start">Cloudflare Workers QuickStart</a></li>
        <li><a href="./providers/cloudflare/guide">Guide</a></li>
        <li><a href="./providers/cloudflare/cli-reference">CLI Reference</a></li>
        <li><a href="./providers/cloudflare/events">Events</a></li>
      </ul>
    </div>
  </div>
</div>
