<!--
title: Serverless Framework - AWS Lambda Guide - Testing
menuText: Testing
menuOrder: 9
description: Recommendations and best practices for testing AWS Lambda Functions with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/testing)
<!-- DOCS-SITE-LINK:END -->

# Testing

Serverless introduces a lot of simplifications when it comes to serving business logic. We only need to provide handler function that almost entirely implements business logic. The only thing that we need to apply to are handler function arguments that are passed by FaaS provider. E.g. AWS Lambda passes 3 arguments `event`, `context` and `callback` to Node.js functions. Of course list of arguments differs between languages and, what is more important, between FaaS providers.

Another important factor is a cloud environment. Basically, it's impossible to emulate AWS locally. Of course projects like [dynamodb-local](http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) or [kinesalite](https://github.com/mhart/kinesalite) may help but AWS (and other providers) provide much more services. We shouldn't rely on local implementations if we want to be 100% sure that our service won't fail after deploying to production environment.

Because of those issues (and having [test pyramid](http://martinfowler.com/bliki/TestPyramid.html) in mind) we suggest following testing strategy:

- business logic should be independent from FaaS provider,
- unit testing should be used as a main tool for verifying business logic,
- integration tests should be used for verifying integration with other services.

Let's take simple Node.js function as an example. The responsibility of this function is to save user into DB and send welcome email:

```javascript
const db = require('db').connect();
const mailer = require('mailer');

module.exports.saveUser = (event, context, callback) => {
  const user = {
    email: event.email,
    created_at: Date.now()
  }

  db.saveUser(user, function (err) {
    if (err) {
      callback(err);
    } else {
      mailer.sendWelcomeEmail(event.email);
      callback();
    }
  });
};
```

There are two main problems with this functions:

- code is bounded to how AWS Lambda passes incoming data (`event` object),
- testing this function require running DB instance and mail server.

## Unit testing

Business logic should be implemented in a way that allows using it in a different environment, no matter if it's AWS Lambda, Google Cloud Functions or HTTP server. Instead of writing complicated handler functions we should extract what is the core of our business. Let's extract it from above example

```javascript
class Users {
  constructor(db, mailer) {
    this.db = db;
    this.mailer = mailer;
  }

  save(email, callback) {
    const user = {
      email: email,
      created_at: Date.now()
    }

    this.db.saveUser(user, function (err) {
      if (err) {
        callback(err);
      } else {
        this.mailer.sendWelcomeEmail(email);
        callback();
      }
  });
  }
}
```

This class is testable and doesn't require running any of the external services. Instead of real `db` and `mailer` objects we can pass mocks and assert if `saveUser` and `sendWelcomeEmail` has been called with proper arguments. We should have as much unit-test as possible and run them every code change. Of course passing unit-tests doesn't mean that our function is working as expected. That's why we also need integration test.

## Integration tests

After extracting business logic to separate module handler function looks like this:

```javascript
const db = require('db').connect();
const mailer = require('mailer');
const users = require('users')(db, mailer);

module.exports.saveUser = (event, context, callback) => {
  users.save(event.email, callback);
};
```

It's responsible for setting up dependencies, injecting them and calling business logic functions. This code will be changed less often. To make sure that function is working as expected integration tests should be ran against deployed function. They should invoke function (`serverless invoke`) with fixture email address, check if user is actually saved to DB and check if email was received.
