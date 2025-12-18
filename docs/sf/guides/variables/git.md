<!--
title: Serverless Framework - Variables - Git
description: How to reference git variables
short_title: Serverless Variables - Git Variables
keywords: ['Serverless Framework', 'Git', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/git)

<!-- DOCS-SITE-LINK:END -->

# Reference Git Variables

You can leverage Git-related information in your `serverless.yml` configuration using Git variables. This allows you to include dynamic data related to your Git environment directly into your deployment configuration.

### Available Git Variables:

- **describe**: A representation of the latest commit, using tags if available, otherwise the short SHA-1 hash.
- **describeLight**: Like `describe` but only considers lightweight (non-annotated) tags.
- **sha1**: The short SHA-1 hash of the latest commit.
- **commit**: The full SHA hash of the latest commit.
- **branch**: The name of the current branch.
- **message**: The full commit message of the latest commit.
- **messageSubject**: The subject line of the commit message.
- **messageBody**: The body of the commit message.
- **user**: The name of the user from Git configuration.
- **email**: The email address of the user from Git configuration.
- **isDirty**: Indicates whether there are uncommitted changes (returns 'true' or 'false').
- **repository**: The name of the repository.
- **tags**: The tags pointing at the current commit, or the short SHA-1 hash if no tags are present.

### Syntax

To reference Git variables, use the `${git:<variable>}` syntax in your `serverless.yml`.
Here's how you might use these variables:

```yml
service: new-service
functions:
  hello:
    name: hello-${git:branch}
    handler: handler.hello
    description: ${git:message}
```

In the above configuration, the service and function names will dynamically include the branch name, and the function description will include the commit message.
