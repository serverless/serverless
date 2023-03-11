# Huawei Cloud - Events

Simply put, events are the things that trigger your functions to run.

If you are using Huawei Cloud as your provider, `events` in the service are limited to the Huawei Cloud APIGateway and OBS.

[View the Huawei Cloud Function Compute events section for a list of supported events](../events)

Upon deployment, the framework will set up the corresponding event configuration your `function` should listen to.

## Configuration

Events belong to each Function and can be found in the `events` property in `serverless.yml`.

```yml
# serverless.yml
functions:
  first: # Function name
    handler: index.http # Reference to file index.js & exported function 'http'
    events:
      - apigw:
          env_id: DEFAULT_ENVIRONMENT_RELEASE_ID
          env_name: RELEASE
          req_method: GET
          path: /test
          name: API_test
```

**Note:** Currently only one event definition per function is supported.

## Types

The Serverless Framework supports the Huawei Cloud Function Compute events `obs` and `Apig`. Instead of listing them here, we've put them in a separate section. [Check out the events section for more information.](../events)

## Deploying

To deploy or update your Functions and Events run `serverless deploy`.
