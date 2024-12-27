## OBS

Your Huawei Cloud Function can be triggered by different `event` sources. Those event sources can be defined and configured with the help of the `event` event.

## OBS events

This example sets up a `obs` event which will trigger the `first` function whenever an object is uploaded to the `my-service-resource`.

```yml
# serverless.yml

functions:
  first:
    handler: index.first
    events:
      - obs:
          bucket: bucket
          events:
            - s3:ObjectCreated:Put
            - s3:ObjectCreated:Post
```

```javascript
// index.js

exports.first = async (event, context) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello!',
    }),
  };

  return response;
};
```
