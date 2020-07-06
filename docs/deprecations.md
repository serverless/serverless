<!--
title: Serverless Framework Deprecations
menuText: Deprecations
layout: Doc
-->

# Serverless Framework Deprecations

<a name="OUTDATED_NODEJS"><div>&nbsp;</div></a>

## Outdated Node.js version

It appears you rely on no longer maintained Node.js version.

Please upgrade to use at least Node.js v10 (It's recommended to use LTS version, as listed at https://nodejs.org/en/)

<a name="AWS_ALB_ALLOW_UNAUTHENTICATED"><div>&nbsp;</div></a>

## AWS ALB `allowUnauthenticated`

Please use `onUnauthenticatedRequest` instead. `allowUnauthenticated` will be removed with v2.0.0

<a name="BIN_SERVERLESS"><div>&nbsp;</div></a>

## `bin/serverless`

Please use `bin/serverless.js` instead. `bin/serverless` will be removed with v2.0.0
