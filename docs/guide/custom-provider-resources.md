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

### Example custom resources - HTTP Proxy
As a practical example for adding a custom resource to your service, we're going to demonstrate how you can create an API Gateway HTTP proxy using Cloud Formation templates/resources.

To set up an HTTP proxy, you'll need two CloudFormation templates, one for the endpoint (known as resource in CF), and one for method. These two templates will work together to construct your proxy. So if you want to set `your-app.com/serverless` as a proxy for `serverless.com`, you'll need the following two templates in your `serverless.yaml`:


```yaml
# serverless.yaml
service: service-name
provider: aws
functions:
  ...
resources:
  Resources:
    ProxyResource:
      Type: AWS::ApiGateway::Resource
      Properties:
        ParentId:
          Fn::GetAtt:
            - RestApiApigEvent # our default Rest API logical ID
            - RootResourceId
        PathPart: serverless # the endpoint in your API that is set as proxy
        RestApiId:
          Ref: RestApiApigEvent
    ProxyMethod:
      ResourceId:
        Ref: ProxyResource
      RestApiId:
        Ref: RestApiApigEvent
      Type: AWS::ApiGateway::Method
      Properties:
        AuthorizationType: NONE
        HttpMethod: GET # the method of your proxy. Is it GET or POST or ... ?
        MethodResponses:
          - ResponseModels: {}
            ResponseParameters: {}
            StatusCode: 200
        RequestParameters: {}
        Integration:
          IntegrationHttpMethod: POST
          Type: HTTP
          Uri: http://serverless.com # the URL you want to set a proxy to
          RequestTemplates:
            application/json: ""
          IntegrationResponses:
            StatusCode: 200
            ResponseParameters: {}
            ResponseTemplates:
              application/json: ""

```

There's a lot going on in these two templates, but all you need to know to set up a simple proxy is setting the method & endpoint of your proxy, and the URI you want to set a proxy to.

Now that you have these two CloudFormation templates defined in your `serverless.yaml` file, you can simply run `serverless deploy` and that will deploy these custom resources for you along with your service and set up a proxy on your Rest API.

## Referencing an external `.json` file

Sometimes it's hard to translate the provider specific resources into valid YAML syntax. Furthermore the resource code
might be verbose and make the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file bloated.

You can always use JSON-Ref to reference external `.json` files. This way you can organize your resource related code
into an own `.json` file and reference it from within [`serverless.yaml`](../understanding-serverless/serverless-yaml.md)
like this:

```yaml
resources:
  Resources:
    $ref: ./cloudformation-resources.json
```

The corresponding resources which are defined inside the `cloudformation-resources.json` file will be resolved and loaded
into the `Resources` section.

## How custom provider resources are added

On deployment Serverless will load the base stack template and merge the custom resources you've defined in the `resources`
section of the service alongside the compiled function and corresponding event resources into it.

After that the template (with all merged resources) will be deployed on the providers infrastructure.

## Conclusion

The `resources` section inside the [`serverless.yaml`](../understanding-serverless/serverless-yaml.md) file is a place
where you can add custom, provider specific resource definitions which should be created on service deployment.
It gives you access to the whole feature set your provider offers and makes Serverless even more extensible.

The last thing we need to learn is how we can remove our service. Let's take a look at this now.

[Next step > Removing your service](removing-a-service.md)
