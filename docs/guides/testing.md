<!--
title: Serverless Dashboard - Testing
menuText: Testing
menuOrder: 11
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/guides/testing/)

<!-- DOCS-SITE-LINK:END -->

# Testing

Serverless Framework supports defining and running integration tests against lambdas
with HTTP integrations. To get started, assuming we have the default configuration in from the
[enterprise-template](https://github.com/serverless/enterprise-template), you can define a test for
it as follows with a `serverless.test.yml` file:

```yml
- name: hello endpoint returns 200
  endpoint:
    function: hello
  response:
    status: 200
```

Then, when you run `sls test` (your function must already have been deployed) it will make an HTTP
request against the `hello` function and pass if the response has a status code of 200:

```
$ sls test
Serverless Enterprise: Test Results:

  Summary --------------------------------------------------

  passed - POST hello - hello endpoint returns 200

Serverless Enterprise: Test Summary: 1 passed, 0 failed
```

If we add a test like this which requires the body to be JSON encoded and contain a key called
`foo` with the value `bar`.

```yml
- name: hello endpoint returns 200
  endpoint:
    function: hello
  response:
    body:
      foo: bar
```

Then when we run `sls test` we get the details of the failure:

```
$ sls test
Serverless Enterprise: Test Results:

  Summary --------------------------------------------------

  passed - POST hello - hello endpoint returns 200
  failed - POST hello - hello endpoint returns 2000

  Details --------------------------------------------------

  1) Failed - hello endpoint returns 200
     status: 200
     headers: (TRUNCATED)
     expected: body = {
       "foo": "bar"
     }
     received: body  = {
       "message": (TRUNCATED),
       "input": (TRUNCATED),
     }

Serverless Enterprise: Test Summary: 1 passed, 1 failed
```

## `serverless.test.yml` specification

The specification file must be an array of objects. Each test is an object in that array.
Here is a config file that uses all the options:

```yaml
- name: hello endpoint returns success # the name of the test. used for running a specific test & in CLI output
  endpoint: # this is used to specify which HTTP endpoint / lambda to test against
    # specifying only the function name only works if the function has only one HTTP endpoint and
    # a specific path & method (i.e. not ANY or {parameterizedUrls})
    function: hello
  response: true # setting response to true is equivalent to setting it to {status: 200}
  request: # this specifies the request to send
    headers: # An object mapping to be used as headers on the request
      Foo: bar
    body: 'foobar' # string literal bodies are used as-is
- name: "hello endpoint returns 'foobar'"
  endpoint:
    # if specifying both method & path, function is optional
    method: POST
    path: /hello
  response:
    body: 'foobar' # setting body to a string literal checks that the response text matches it exactly
- name: hello endpoint returns ok with json request
  endpoint:
    function: hello
  response: true
  request:
    body: # setting body to an object json encodes it & adds the correct content-type header
      foo: bar
      blah: baz
- name: hello endpoint returns success with a form request
  endpoint:
    function: hello
  response: true
  request:
    form: # setting form encodes to a query param, i.e.: ?foo=bar&blah=baz
      foo: bar
      blah: baz
- name: hello endpoint returns success with a text request
  endpoint:
    function: hello
  response: true
  request:
    body: 'foobar' # setting body to a string uses it with out any changes
```

## Options

There are 2 options to allow you to avoid running your entire test suite:

- `--function` - only run tests for the function specified. This requires that you've set `endpoint.function`
- `--name` - only run the test with the specified name
