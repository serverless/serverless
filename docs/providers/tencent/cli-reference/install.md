
# Tencent-scf - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/some/service
```

## Options

- `--url` or `-u` The services Git URL. **Required**.
- `--name` or `-n` Name for the service.

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/tencentcloud/serverless/tencent-nodejs
```

This example will download the .zip file of the `tencent-nodejs` service from GitHub, create a new directory with the name `tencent-nodejs` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/tencentcloud/serverless/tencent-nodejs --name my-service
```

This example will download the .zip file of the `tencent-nodejs` service from GitHub, create a new directory with the name `my-service` in the current working directory and unzips the files in this directory and renames the service to `my-service` if `serverless.yml` exists in the service root.

### Installing a service from a directory in a GitHub URL

```bash
serverless install --url https://github.com/tencentyun/scf-demo-repo/tree/master/Nodejs8.9-HexoDemo
```

This example will download the `Nodejs8.9-HexoDemo` service from GitHub.
