<!--
title: Serverless Framework - Fn Guide - Debugging
menuText: Debugging
menuOrder: 8
description: Recommendations and best practices for debugging Fn Functions with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/fn/guide/debugging)

<!-- DOCS-SITE-LINK:END -->

# Fn - Debugging

How can we debug errors in our Fn functions?

Let's imagine that we have deployed the following Nodejs code as a Fn function using Serverless:

```javascript
const fdk = require('@fnproject/fdk');

fdk.handle((input) => {
  input = JSON.parse(input);
  let name = 'World';
  if (input.name) {
    name = input.name;
  }
  const response = { message: `Hello ${name}` };
  console.error(`I show up in the logs name was: ${name}`);
  return response;
});
```

And its corresponding Serverless YAML file:

```yml
service:
  name: hello-world

provider:
  name: fn

plugins:
  - serverless-fn
functions:
  hello:
    name: hello
    version: 0.0.1
    runtime: node
    format: json
    events:
      - http:
          path: /hello
```

Let's invoke correctly that function

```
serverless invoke --function hello --data '{"name":"Bob"}' -l

# Output
Serverless: Calling Function: hello
{ message: 'Hello Bob' }
I show up in the logs name was: Bob
```

If we were to call the above function with an incorrect json data you would get `Hello World` back instead of `Hello Bob`
In order to debug this since there is nothing fatal happening and no stack trace is appearing in the logs you would need to
add more console.error calls until you figure it out. If there were a major error
that caused a stacktrace and the entire function to fail then you could easily call

```
serverless logs --function hello
```

That would print any stack traces that may have gone to stderr

This is a very basic example of debugging a Fn function, but it should hopefully highlight the basic principles. Obviously, in production environments, you would want to have more formal and sophisticated error handling built into your code.
