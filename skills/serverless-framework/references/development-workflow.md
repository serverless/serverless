# Developing and testing a feature

Read this when adding or changing a feature: a new endpoint, a table, queue,
or topic, IAM permissions, environment variables, or event wiring. Develop
those changes test-first against a personal stage. Changes to internal logic
alone need only unit tests.

`serverless dev` runs Node.js (JavaScript and TypeScript) and Python
functions on your machine; the `serverless-dev-mode` skill has its commands.

## The loop

1. **Change the configuration** in `serverless.yml`: the resource, its
   wiring, and its IAM permissions.
2. **Start `serverless dev --detach --json --stage <you>`.** In a
   single-service project a stage that was never deployed is deployed first;
   otherwise the functions attach in seconds. In a Compose project, run
   `npm run deploy:personal-stage` first
   ([multi-service.md](multi-service.md)): `dev` deploys only the service it
   runs for, so the services it reads from must already be deployed; then
   start `npm run -s dev:<service> -- --detach --json` (`-s` keeps npm's
   banner off stdout, so the JSON result is all that is there). It returns
   once the session is ready, at most after 100 seconds; exit 124 means it
   is still starting in the background. From then on, real AWS events reach
   the function code on your machine, and each edit applies on the next
   event.
3. **Write the tests** (before starting the session, or once it is ready):
   - **Unit tests** for handler logic, with the AWS SDK mocked by
     [`aws-sdk-client-mock`](https://github.com/m-radzikowski/aws-sdk-client-mock),
     so they run with no AWS access and no network. The Lambda runtime
     provides the `@aws-sdk/*` clients, but the tests run locally: add the
     clients the handlers import to `devDependencies`, next to
     `aws-sdk-client-mock`. Expose them as `npm run test:unit`.
   - **Integration tests** that exercise the deployed system end to end, with
     an HTTP request or `serverless invoke`. Read the target stage from
     `STAGE`, which the `test:integration` script sets to `${STAGE:-$USER}`
     (your personal stage locally, a short-lived stage in CI), and read the
     endpoint from the stack outputs in
     `serverless info --stage $STAGE --json`. Expose them as
     `npm run test:integration`.
   - **Keep the tests out of the package.** Unless a build bundles the
     handlers, every file in the service directory is zipped into each
     function; exclude the test folders in `serverless.yml` with
     `package.patterns: ['!test/**']`.
4. **Implement the change.** With `dev` running, each edit applies on the
   next event. Each warm Lambda execution environment keeps one process on
   your machine, so state kept outside the handler carries over between its
   invocations, as in a warm Lambda.
5. **Run the unit tests.** They do not wait for `dev`.
6. **Run the integration tests** against your personal stage once the
   session is ready: when step 2 exited 0, or, after an exit 124, once
   `serverless dev wait --for ready --json` has returned.

Write the tests up front even if they cannot run yet. When sign-in or AWS
credentials are missing, `dev` cannot start: set steps 2 and 6 aside, hand the
user the fix from [cli.md](cli.md), and resume those steps once they are
done, without waiting to be asked again.

## After a dev session

`serverless dev stop` ends the session and restores the functions; they
serve the deployed code again. If a session was killed,
`serverless dev restore --stage <you>` restores them (the next
`serverless deploy` does too). Run `serverless dev --detach --stage <you>`
again to resume.

## Handlers that use a private VPC database

`dev` runs the handler on your machine, which cannot reach a database inside a
private VPC; the deployed function can. For Dev Mode to relay a VPC
function's invocations at all, the function needs a route to AWS IoT Core,
STS and S3; the start-up table notes `vpc_egress_required`. Two ways to work
on the database code:

- **Keep the database path deployed.** Start the session with
  `--skip-function <name>` for the functions that query the database, so they
  keep running in the VPC, check them with `serverless invoke --stage <you>`,
  and use `dev` for everything else. Prefer this unless you need fast
  iteration on the database code itself.
- **Bridge the network for the session.** Use an SSM Session Manager
  port-forward to the database (through an SSM-managed instance or an EC2
  Instance Connect Endpoint in the VPC), or the organization's existing VPN
  or bastion, and point the handler at `localhost` for the session.
