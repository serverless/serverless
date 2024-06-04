# Huawei Cloud - Install

Installs a service from a GitHub URL in the current working directory.

```bash
serverless install --url https://github.com/some/service
```

## Options

- `--url` or `-u` The services GitHub URL. **Required**.
- `--name` or `-n` Name for the service.

## Examples

### Installing a service from a GitHub URL

```bash
serverless install --url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs
```

This example will download the .zip file of the `huawei-nodejs` service from GitHub, create a new directory with the name `huawei-nodejs` in the current working directory and unzips the files in this directory.

### Installing a service from a GitHub URL with a new service name

```bash
serverless install --url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs--name my-huawei-service
```

This example will download the .zip file of the `huawei-nodejs` service from GitHub, create a new directory with the name `my-huawei-service` in the current working directory and unzips the files in this directory and renames the service to `my-huawei-service` if `serverless.yml` exists in the service root.

### Installing a service from a directory in a GitHub URL

```bash
serverless install --url https://github.com/zy-linn/examples/tree/v3/legacy/huawei-nodejs
```

This example will download the `huawei-nodejs` service from GitHub.
