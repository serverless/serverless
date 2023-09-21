<!--
title: Serverless Dashboard - CI/CD FAW
menuText: FAQ
menuOrder: 11
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://serverless.com/framework/docs/guides/cicd/faq/)

<!-- DOCS-SITE-LINK:END -->

# Frequently Asked Questions

## Is there a free tier?

Yes. No credit card required, just sign up. Free tier only supports public
repos. Upgrade to a paid tier to use CI/CD with private repos.

## Do you support preview deployments from pull requests?

Yes! You can add preview deployments to your CI/CD Settings. This will
automatically test and deploy your service from a pull request. The results will
be posted in the pull request status. You can also setup auto deletion of
deployed resources for preview deployments so that “sls remove” is automatically
run when your feature branch is merged and deleted.

## Can I deploy for multiple branches?

Yes! Add other branch deployments to configure from any branch to any stage. We
see a lot of folks deploy to a staging environment from the master branch, and
to production from a production branch.

## Can I use different AWS Accounts for each Stage?

Yes! You can use deployment profiles to add as many AWS Accounts as you would
like, and map them to individual stages in your application.

## Is it just for Serverless Framework?

Yes! Serverless CI/CD is designed around the Serverless Framework to provide a
seamless experience for developers. Anything you can deploy with the Serverless
Framework you can deploy with Serverless CI/CD. The Serverless Framework is
extensible with Plugins , so it works with a broad range of services.

## Are all runtimes supported?

Only the most popular runtimes, Node and Python, are currently supported. These
two runtimes account for about 90% of all serverless services. Support for other
runtimes is coming soon.

## Does Serverless CI/CD support AWS, Azure and GCP?

Only AWS is supported at this time; however, support for other cloud service
providers is coming.

## Do I need to host, manage, or operate any agents?

Nope! Serverless CI/CD is a 100% SaaS and managed for you.
