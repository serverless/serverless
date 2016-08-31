# Creating a service

Let's create our first Serverless service!

## Creating our service

You can create a service based on a specific template that specifies which provider and runtime to use (take a look
[here](../service-templates) to learn more about templates).

To create a service with a `nodejs` runtime running on `aws` just pass the `aws-nodejs` template to the create command:

```
serverless create --template aws-nodejs
```

This will create a service and generate `serverless.yml` and `handler.js` files in the current
working directory.

## Open the service inside your editor

Let's take a closer look at the skeleton Serverless has created for us. Open up the `first-service` directory with your
favorite editor.

You'll see the following files:
- `serverless.yml`
- `handler.js`

### [`serverless.yml`](../understanding-serverless/serverless-yml.md)

This is our core service file. You can see the name of our service, the provider and the first function inside the
`functions` definition which points to the `handler.js` file.

If you want to learn more about the [`serverless.yml`](../understanding-serverless/serverless-yml.md) file you might
want check out our [in depth guide](../understanding-serverless/serverless-yml.md) about it.

### `handler.js`

The `handler.js` file includes a function skeleton which returns a simple message. The function definition in
`serverless.yml` will point to this `handler.js` file and the function inside of it.

## Conclusion

We've just created our very first service with one simple `create` command. With that in place we're ready to deploy
our service (which now includes one example function) to our provider (in this case Amazon Web Services).

[Next step > Deploying our service](deploying-a-service.md)
