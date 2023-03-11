<!--
title: Serverless Framework Commands - Huawei Cloud Function Compute - Create
menuText: create
menuOrder: 1
description: Creates a new Service in your current working directory
layout: Doc
-->

# Huawei Cloud - Create

Creates a new service in the current working directory based on the specified template.

**Create service in current working directory:**

```bash
serverless create --template-url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs
```

**Create service in new folder using a custom template:**

```bash
serverless create --template-url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs --path my-service
```

## Options
- `--template-url` or `-u` A URL pointing to a remotely hosted template. **Required if --template and --template-path are not present**.
- `--template-path` The local path of your template. **Required if --template and --template-url are not present**.
- `--path` or `-p` The path where the service should be created.
- `--name` or `-n` the name of the service in `serverless.yml`.

## Examples

### Creating a new service

```bash
serverless create --template-url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs --name my-special-service
```

This example will generate scaffolding for a service with `huawei` as a provider and `nodejs` as runtime. The scaffolding will be generated in the current working directory.

### Creating a named service in a (new) directory

```bash
serverless create --template-url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs --path my-new-service
```

This example will generate scaffolding for a service with `huawei` as a provider and `nodejs` as runtime. The scaffolding will be generated in the `my-new-service` directory. This directory will be created if not present. Otherwise Serverless will use the already present directory.

Additionally Serverless will rename the service according to the path you provide. In this example the service will be renamed to `my-new-service`.
