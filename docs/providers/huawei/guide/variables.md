# Huawei Cloud - Variables

The Serverless framework provides a powerful variable system which allows you to add dynamic data into your `serverless.yml`. With Serverless Variables, you'll be able to do the following:

- Reference & load variables from environment variables
- Reference & load variables from CLI options
- Recursively reference properties of any type from the same `serverless.yml` file
- Recursively reference properties of any type from other YAML / JSON files
- Recursively nest variable references within each other for ultimate flexibility
- Combine multiple variable references to overwrite each other

**Note:** You can only use variables in `serverless.yml` property **values**, not property keys. So you can't use variables to generate dynamic logical IDs in the custom resources section for example.

## Reference variables from environment variables

To reference variables from environment variables, use the `${env:someProperty}` syntax in your `serverless.yml`.

```yml
service: new-service

provider:
  name: huawei
  runtime: Node.js14.18
  credentials: ~/.fg/credentials # path must be absolute
  environment:
    variables:
      ENV_FIRST: ${env:TENCENTCLOUD_APPID}

plugins:
  - serverless-huawei-functions

functions:
  hello:
    handler: index.hello
```
