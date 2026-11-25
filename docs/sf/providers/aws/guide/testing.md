<!--
title: Testing Lambda Functions
description: Structure Lambda functions for unit tests, and run integration tests against a deployed stage with serverless invoke and Dev Mode.
short_title: Testing
keywords:
  [
    'Serverless Framework',
    'AWS Lambda testing',
    'unit tests',
    'integration tests',
    'serverless invoke',
  ]
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/guide/testing)

<!-- DOCS-SITE-LINK:END -->

# Testing Lambda Functions

Lambda functions are easiest to test when the business logic lives in plain modules and the handler only translates the Lambda event into a call to that logic. Unit tests then run the logic with stubs for databases and other services, and integration tests run the deployed functions in a test stage, with `serverless invoke` or [Dev Mode](./dev-mode.md). This page shows that structure for a Node.js function and the Framework commands for each kind of test.

A service's functions depend on AWS services that are hard to emulate locally, often run asynchronously from events, and work together across several functions, so test at two levels:

- **Unit tests** for the business logic, without AWS: fast, and most of your tests.
- **Integration tests** against real AWS resources in a dedicated stage: fewer, and they check the event wiring, IAM permissions and configuration that unit tests can't.

## Separate business logic from the handler

This handler saves a user and sends a welcome email, with the database and mailer calls inside the handler:

```javascript
// handler.mjs
import { connect } from './db.mjs'
import { sendWelcomeEmail } from './mailer.mjs'

const db = connect()

export const saveUser = async (event) => {
  const user = {
    email: event.email,
    created_at: Date.now(),
  }

  await db.saveUser(user)
  await sendWelcomeEmail(event.email)
}
```

A test for this handler needs a real database and mail server, and the logic is tied to the shape of Lambda's `event`. Move the logic into a class that receives its dependencies:

```javascript
// users.mjs
export class Users {
  constructor(db, mailer) {
    this.db = db
    this.mailer = mailer
  }

  async save(email) {
    const user = {
      email,
      created_at: Date.now(),
    }

    await this.db.saveUser(user)
    await this.mailer.sendWelcomeEmail(email)
  }
}
```

The handler then only creates the dependencies and passes the event's data to the logic:

```javascript
// handler.mjs
import { connect } from './db.mjs'
import * as mailer from './mailer.mjs'
import { Users } from './users.mjs'

const users = new Users(connect(), mailer)

export const saveUser = async (event) => {
  await users.save(event.email)
}
```

The handler changes only when the event or the wiring changes, and `Users` can be reused from other handlers. Lambda's `nodejs24.x` runtime runs async handlers only; callback-based handlers (`(event, context, callback)`) run on Node.js 22 and earlier ([Lambda Node.js handler](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)).

## Unit test the business logic

A unit test passes stubs for the database and the mailer, and checks the calls. This test uses Node.js's built-in test runner:

```javascript
// users.test.mjs
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Users } from './users.mjs'

test('save stores the user and sends a welcome email', async () => {
  const db = { saveUser: mock.fn(async () => {}) }
  const mailer = { sendWelcomeEmail: mock.fn(async () => {}) }

  await new Users(db, mailer).save('test@example.com')

  assert.equal(db.saveUser.mock.calls[0].arguments[0].email, 'test@example.com')
  assert.deepEqual(mailer.sendWelcomeEmail.mock.calls[0].arguments, [
    'test@example.com',
  ])
})
```

Run it with:

```bash
node --test
```

## Integration test a deployed stage

Integration tests run against a stage that holds only test data. The service's `serverless.yml` maps the function key `saveUser` to the `saveUser` export of `handler.mjs`:

```yaml
# serverless.yml
service: users

provider:
  name: aws
  runtime: nodejs24.x

functions:
  saveUser:
    handler: handler.saveUser
```

The deployed handler imports `db.mjs` and `mailer.mjs`, your modules that connect to the database and the mail service; the unit test doesn't need them. `--stage test` deploys a separate stack, but it doesn't change the database or mail service those modules connect to. Before the first invocation, set both connections per stage, for example as environment variables from [stage parameters](./services.md#stage-parameters), and check that the `test` stage's values point to a test database and a test mail service.

To deploy a `test` stage, invoke the function with a fixture and remove the stage afterwards:

```bash
serverless deploy --stage test
```

```bash
serverless invoke --stage test --function saveUser --data '{"email":"test@example.com"}'
```

Then check the result where it lands: the user in the test database and the email in a test inbox. The function's logs are available with `serverless logs --stage test --function saveUser`. To delete the stage and its resources:

```bash
serverless remove --stage test
```

For events other than direct invocation, trigger the real source: send a request to the stage's HTTP endpoint, put a message on its queue or upload an object to its bucket, and check the outcome.

## Run functions on your machine

Two commands run your code locally while you develop and debug:

- [`serverless invoke local`](../cli-reference/invoke-local.md) runs a function's handler on your machine with an event you pass, without deploying. Calls to AWS services use your local credentials, not the function's IAM role.
- [`serverless dev`](./dev-mode.md) runs the code in your working copy for real invocations of a deployed stage, with the deployed function's environment variables and IAM role, so you can debug against real events without redeploying.

To try a whole deployment without an AWS account, deploy the service to [AWS Emulator](./aws-emulator.md), AWS's local emulator of the AWS APIs. Your handlers run there on embedded JavaScript and Python engines rather than the Lambda runtimes, so keep a test stage in AWS for integration tests.

## Related

- [`serverless invoke`](../cli-reference/invoke.md)
- [Dev Mode](./dev-mode.md)
- [Deploy to AWS Emulator](./aws-emulator.md)
- [Testing serverless functions and applications](https://docs.aws.amazon.com/lambda/latest/dg/testing-guide.html) in the AWS Lambda developer guide
