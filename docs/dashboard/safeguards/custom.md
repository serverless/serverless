<!--
title: Serverless Dashboard - Custom Safeguards
menuText: Custom Safeguards
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/dashboard/safeguards/custom/)

<!-- DOCS-SITE-LINK:END -->

# Custom Policies

In addition to built-in policies configurable in the Serverless Framework Dashboard, you can add custom policies to your application.

## Creating a custom service policy

A service policy is simply a Javascript packaged in a module export which you can use in the
Serverless Framework project for your service. To start with a custom policy first create a
directory in your working directory (e.g. `./policies`) to store the policy files.

Create a single JS file to define your policy (e.g. `my-custom-policy.js`) in the
policies directory.

**./policies/my-custom-policy.js**

```javascript
module.exports = function myCustomPolicy(policy, service) {
  // policy.fail(“Configuration is not compliant with policy”)
  policy.approve();
};
```

There are two primary methods you can use to control the behavior of the policy checks
when running the `deploy` command.

- `approve()` - Passes the policy to allow the deploy to continue.
- `fail(message)` - Fails the policy check and returns an failure message.

To define the policy method you’ll need to inspect the configuration. The entire
configuration is made available in the service object. Use the [default policies](https://github.com/serverless/enterprise-plugin/tree/master/src/lib/safeguards/policies)
and [example policies](https://github.com/serverless/enterprise-plugin/tree/master/examples/safeguards-example-service/policies)
as reference to the content of the service object.

### Enabling a custom policy

Once the policy is implemented and saved in the directory, add the `safeguards`
block to the `serverless.yml` file and set the `location` property to reference
the relative path of the policies directory. To enable the policy you must also
add it to the list of policies.

**serverless.yml**

```yaml
custom:
  safeguards:
    location: ./policies
    policies:
      - stage-in-table-name
```

### Adding settings to your policy

Custom policies may also include configuration parameters. The policy function
accepts a third parameter (`options` in the example below) which contains the
settings defined in the `serverless.yml` file.

**./policies/my-custom-policy.js**

```javascript
module.exports = function myCustomPolicy(policy, service, options) {
  // options.max = 2
  policy.approve();
};
```

**serverless.yml**

```yaml
custom:
  safeguards:
    location: ./policies
    policies:
      - my-custom-policy:
          max: 2
```

## Creating a custom organization policy

The custom local policies allow you to define policies as a part of your service’s working directory, but if you need to define a new custom policy across all of your applications and services, then you need to create a custom remote policy. The custom remote policies are defined as a special type of safeguard policy in the Serverless Framework Dashboard and apply to all applications and services in that tenant.

**Create a new javascript safeguard policy in the dashboard**

In the dashboard go to `safeguards` > `+ add`.

On the `add a safeguard policy` page, set the name, description, enforcement level fields and from the `safeguards` dropdown select `javascript`.

Selecting `javascript` as the `safeguard` will enable a IDE-like text area labeled `safeguard configuration` where you define custom javascript policies.

**Defining the safeguard policy**

In the IDE-like text area, `safeguard configuration`, write the javascript code for the custom safeguard.

The javascript code must return `true` to pass the policy check, or `false` to fail the policy check. If the code doesn’t explicitly `return`, then the response from the last line will be used as the policy check response.

To define the policy method you’ll need to inspect the configuration. The entire
configuration is made available in the service object. Use the [default policies](https://github.com/serverless/enterprise-plugin/tree/4416ac1e10e66a06c2025d0b1faaa29b17df5bcb/lib/safeguards/policies) as reference to the content of the service object.

**Enabling the custom safeguard policy**

Since this safeguard policy is defined in the dashboard, no further action is needed to enable it for all services. It will be evaluated across all services when running `sls deploy`.
