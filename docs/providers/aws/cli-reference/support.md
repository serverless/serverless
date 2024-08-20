<!--
title: Serverless Framework Commands - Support
description: Generate issue reports and get support
short_title: Commands - Support
keywords:
  ['Serverless', 'Framework', 'AWS Lambda', 'support', 'issue', 'report']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/cli-reference/login)

<!-- DOCS-SITE-LINK:END -->

# Support

The `support` command runs an interactive prompt to generate issue reports, or directly connect with our support team.

It will automatically capture relevent context and omit sensitive details like secrets and account information, from the last command that was run. This streamlines the process for opening new Github issues, using AI chat, and opening support requests.

If you select the support option, you will prompted to review the generated report prior to submitting to Serverless support.

```bash
sls support
```

## Options

- `--summary` Creates a summary report non-interactively
- `--all` Creates a comprehensive report non-interactively
- `--support` Get help from the Serverless support team.

## Example

The `serverless support` can be used with the `--summary` or `--all` options to generate reports non-interactively so the response can be piped to another command, like `pbcopy`.

```
serverless support --summary | pbcopy
```
