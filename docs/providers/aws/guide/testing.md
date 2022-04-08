<!--
title: Serverless Framework - Testing
description: Recommendations and best practices for testing AWS Lambda Functions with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/testing)

<!-- DOCS-SITE-LINK:END -->

# Testing

While the Serverless Architecture introduces a lot of simplicity when it comes to serving business logic, some of its characteristics present challenges for testing. They are:

- The Serverless Architecture is an integration of separate, distributed services, which must be tested both independently, and together.
- The Serverless Architecture is dependent on internet/cloud services, which are hard to emulate locally.
- The Serverless Architecture can feature event-driven, asynchronous workflows, which are hard to emulate entirely.

To get through these challenges, and to keep the [test pyramid](http://martinfowler.com/bliki/TestPyramid.html) in mind, keep the following principles in mind:

- Write your business logic so that it is separate from your FaaS provider (e.g., AWS Lambda), to keep it provider-independent, reusable and more easily testable.
- When your business logic is written separately from the FaaS provider, you can write traditional Unit Tests to ensure it is working properly.
- Write Integration Tests to verify integrations with other services are working correctly.

## A Poor Example

Here is an example in Node.js of how to follow the practices above. The job this Function should perform is to save a user in a database and then send a welcome email:

```javascript
const db = require('db').connect();
const mailer = require('mailer');

module.exports.saveUser = (event, context, callback) => {
  const user = {
    email: event.email,
    created_at: Date.now(),
  };

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

There are two main problems with this function:

- The business logic is not separate from the FaaS Provider. It's bounded to how AWS Lambda passes incoming data (Lambda's `event` object).
- Testing this function will rely on separate services. Specifically, running a database instance and a mail server.

## Writing Testable AWS Lambda Functions

Let's refactor the above example to separate the business logic from the FaaS Provider.

```javascript
class Users {
  constructor(db, mailer) {
    this.db = db;
    this.mailer = mailer;
  }

  save(email, callback) {
    const user = {
      email: email,
      created_at: Date.now(),
    };

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

module.exports = Users;
```

```javascript
const db = require('db').connect();
const mailer = require('mailer');
const Users = require('users');

let users = new Users(db, mailer);

module.exports.saveUser = (event, context, callback) => {
  users.save(event.email, callback);
};
```

Now, the above class keeps business logic separate. Further, the code responsible for setting up dependencies, injecting them, calling business logic functions and interacting with AWS Lambda is in its own file, which will be changed less often. This way, the business logic is not provider dependent, easier to re-use, and easier to test.

Further, this code doesn't require running any external services. Instead of a real `db` and `mailer` services, we can pass mocks and assert if `saveUser` and `sendWelcomeEmail` has been called with proper arguments.

Unit Tests can easily be written to cover the above class. An integration test can be added by invoking the function (`serverless invoke`) with fixture email address, check if user is actually saved to DB and check if email was received to see if everything is working together.

## Other

Here are a few links to services which can help you test locally:

- [dynamodb-local](http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)
- [kinesalite](https://github.com/mhart/kinesalite)
