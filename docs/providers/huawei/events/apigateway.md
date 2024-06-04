# API Gateway

Huawei Cloud Function Compute can create function based API endpoints through API Gateway.

To create HTTP endpoints as event sources for your Huawei Cloud Function Compute, use the `http` event syntax.

### HTTP endpoint

This setup specifies that the `first` function should be run when someone accesses the Functions API endpoint via a `GET` request. You can get the URL for the endpoint by running the `serverless info` command after deploying your service.

Here's an example:

```yml
# serverless.yml

functions:
  hello:
    handler: index.hello
    events:
      - apigw:
          env_id: DEFAULT_ENVIRONMENT_RELEASE_ID
          env_name: RELEASE
          req_method: GET
          path: /test
          name: API_test
```

```javascript
// index.js

exports.hello = async (event, context) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({ message: 'Hello!' }),
  };

  return response;
};
```

**Note:** See the documentation about the [function handlers](../guide/functions.md) to learn how your handler signature should look like to work with this type of event.
