<!--
title: Git Variables
description: Add the Git commit hash, branch, tags or commit message of the service's repository to serverless.yml with git variables.
short_title: Git Variables
keywords: ['Serverless Framework', 'Git', 'git variable', 'commit hash', 'branch', 'Variables']
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/variables/git)

<!-- DOCS-SITE-LINK:END -->

# Git Variables

A `${git:NAME}` variable inserts information about the Git repository that contains `serverless.yml`, such as the current commit hash, branch or tag, into the configuration. Use it to label a deployment with the code it came from, for example in resource tags, a function description or an environment variable that reports the version.

The following `serverless.yml` tags every function with the commit and branch, sets the function description to the commit subject, and passes the nearest tag to the function as `APP_VERSION`:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs24.x
  tags:
    GIT_COMMIT: ${git:sha1}
    GIT_BRANCH: ${git:branch}

functions:
  hello:
    handler: handler.hello
    description: ${git:messageSubject}
    environment:
      APP_VERSION: ${git:describeLight}
```

The Framework runs `git` in the directory that contains `serverless.yml`, so `git` must be installed and that directory must be inside a Git repository.

## Syntax of the git variable

```text
${git:NAME}
```

`NAME` (required) is one of the names in [Available git variables](#available-git-variables). Every git variable returns a string, with leading and trailing whitespace removed.

## Available git variables

| Name             | Value                                                                                                                                              | Example                                    | Git command                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| `sha1`           | The short hash of the current commit                                                                                                               | `1f769ec`                                  | `git rev-parse --short HEAD`      |
| `commit`         | The full hash of the current commit                                                                                                                | `1f769ecaa84729fa90ef1f3527a6f1df1e3072cf` | `git rev-parse HEAD`              |
| `branch`         | The current branch, or `HEAD` in a detached-HEAD checkout                                                                                          | `main`                                     | `git rev-parse --abbrev-ref HEAD` |
| `describe`       | The nearest annotated tag, with the commits since it and the short hash when the commit isn't tagged; the short hash when there's no annotated tag | `v1.0.0-1-g1f769ec`                        | `git describe --always`           |
| `describeLight`  | Like `describe`, but also uses lightweight tags                                                                                                    | `v1.0.1`                                   | `git describe --always --tags`    |
| `tags`           | The tags on the current commit, joined with `::`; the short hash when the commit has no tags                                                       | `v1.0.0::latest`                           | `git tag --points-at HEAD`        |
| `message`        | The full message of the current commit                                                                                                             | `Add file upload`                          | `git log -1 --pretty=%B`          |
| `messageSubject` | The first line of the commit message                                                                                                               | `Add file upload`                          | `git log -1 --pretty=%s`          |
| `messageBody`    | The commit message after the subject; an empty string when there's none                                                                            | `Validates the file size.`                 | `git log -1 --pretty=%b`          |
| `user`           | `user.name` from the Git configuration                                                                                                             | `Jane Doe`                                 | `git config user.name`            |
| `email`          | `user.email` from the Git configuration                                                                                                            | `jane@example.com`                         | `git config user.email`           |
| `isDirty`        | `'true'` when tracked files have unstaged changes, otherwise `'false'`                                                                             | `'false'`                                  | `git diff --stat`                 |
| `repository`     | The name of the repository's top-level directory on disk, not the name of the remote                                                               | `my-service`                               | `git rev-parse --show-toplevel`   |

Through v4.46.0, `isDirty` returns `'false'` in every case.

CI systems often check out a commit without a branch, so `${git:branch}` returns `HEAD` there. To get the branch name in CI, read the variable your CI system sets, for example `${env:GITHUB_REF_NAME}` in GitHub Actions.

## Where to use git variables

Git values can contain characters that some AWS settings reject, so check the target setting's rules:

- Branch names often contain `/` (`feature/login`), which Lambda function names and many resource names don't allow. Resource tags allow it.
- A commit message can span several lines and run long, while a Lambda function description is limited to 256 characters. `messageSubject` fits more often than `message`.

A value that changes with every commit, such as `sha1` in an environment variable, changes the function's configuration on every deployment, so the Framework updates the function each time.

## Errors from git variables

When a `git` command exits with an error, the Framework stops and shows the command's output, for example outside a Git repository:

```text
Failed to resolve variable 'branch' with resolver 'git' and provider 'git': Error: Command failed: git rev-parse --abbrev-ref HEAD
fatal: not a git repository (or any of the parent directories): .git
```

`${git:user}` and `${git:email}` stop the same way when `user.name` or `user.email` isn't set in the Git configuration. A default value after a comma (`${git:branch, 'local'}`) isn't used when the `git` command exits with an error; to deploy from a directory that might not be a Git repository, use a source that is always available, such as `${env:...}` with a default.

A name that isn't in [Available git variables](#available-git-variables) stops the command with:

```text
Git variable foo is unknown. Candidates are 'describe', 'describeLight', 'sha1', 'commit', 'branch', 'message', 'messageSubject', 'messageBody', 'user', 'email', 'isDirty', 'repository', 'tags'
```

## Related variable sources

- [Variables](./README.md): how variables work, and the list of all variable sources.
- [Environment variables](./env-vars.md): read values your CI system sets, such as the branch name.
- [Serverless Core variables](./core.md): the stage and a per-run instance ID.
- [git describe](https://git-scm.com/docs/git-describe) in the Git documentation: how `describe` and `describeLight` name a commit.
