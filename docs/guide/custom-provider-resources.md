# Custom provider resources

Sometimes you want to add custom, provider related resources to your service to use provider specific functionality
which is not yet available through events or plugins. Serverless has you covered and enables you a convenient way to add
those resources with the help of `resources` section in the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md)
file.

## Adding custom provider resources

Serverless uses the services `resources` object as a place to store all the provider specific resources like compiled
functions or events.

After initialization, Serverless will try to load the `resources` object from the
[`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file into memory.
It will create an own, empty one if it doesn't exist.

You can use this place to add custom provider resources by writing the resource definition in YAML syntax inside the
`resources` object.

```yaml
# serverless.yaml
resources:
    Resources:
        CustomProviderResource:
            Type: ResourceType
            Properties:
                Key: Value
```

On deployment Serverless will load the base stack template and merge the custom resources you've defined in the `resources`
section of the service alongside the compiled function and corresponding event resources into it.

After that the template (with all merged resources) will be deployed on the providers infrastructure.

## Conclusion

The `resources` section inside the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file is a place
where you can add custom, provider specific resource definitions which should be created on service deployment.
It gives you access to the whole feature set your provider offers and makes Serverless even more extensible.

The last thing we need to learn is how we can remove our service. Let's take a look at this now.

[Next step > Removing your service](removing-a-service.md)
