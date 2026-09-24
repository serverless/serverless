# Developing and testing a feature

Read this when adding or changing a feature: a new endpoint, a table, queue,
or topic, IAM permissions, environment variables, or event wiring. Develop
those changes test-first against a personal stage. Changes to internal logic
alone need only unit tests.

`serverless dev` supports Node.js functions only. For Python functions, keep
the tests below and replace the `dev` steps with `serverless invoke local`
and a deploy of your stage ([python.md](python.md)).

## The loop

1. **Change the configuration** in `serverless.yml`: the resource, its
   wiring, and its IAM permissions.
2. **Start `serverless dev` in the background on your personal stage.** In a
   single-service project, `serverless dev --stage <you>` deploys the stage
   itself; no separate deploy is needed. In a Compose project, run
   `npm run deploy:personal-stage` first
   ([multi-service.md](multi-service.md)): `dev` deploys only the service it
   runs for, so the services it reads from must already be deployed. Then
   start `npm run dev:<service>`. The first start deploys the service and
   takes a while, so keep going with the next steps and watch its output
   until the session is connected. From then on, real AWS events reach the
   function code on your machine, and each edit is live without a redeploy.
3. **Write the tests while it starts:**
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
   next event. Each event runs in a new process, so state kept in memory
   outside the handler does not carry over between requests; a deployed
   function keeps it only within one warm instance.
5. **Run the unit tests.** They do not wait for `dev`.
6. **Run the integration tests** against your personal stage once `dev` is
   connected.

Write the tests up front even if they cannot run yet. When sign-in or AWS
credentials are missing, `dev` cannot start: set steps 2 and 6 aside, hand the
user the fix from [cli.md](cli.md), and resume those steps once they are
done, without waiting to be asked again.

## After a dev session

While `serverless dev` runs, the stage's functions relay their events to your
machine. Stop a background session with SIGTERM to the Framework's Node
process; it ends like Ctrl+C and prints the command that restores the stage.
The npm and standalone installs run the CLI in a child Node process, so the
pid from `$!` can be the launcher's: find the session with
`pgrep -f 'sf-core\.js( [^ -][^ ]*)? dev( |$)'`, `kill` that pid, and check
with the same `pgrep` that it is gone. Once the session ends, the functions
answer with a "Dev Mode Disconnected" error until the stage is deployed again, so deploy it
when you are done: `serverless deploy --stage <you>`, or
`npm run restore:personal-stage` in a Compose project. Run `serverless dev`
again instead to resume the session.

## Handlers that use a private VPC database

`dev` runs the handler on your machine, which cannot reach a database inside a
private VPC; the deployed function can. Two ways to work on that code:

- **Keep the database path deployed.** Check database code with
  `serverless invoke --stage <you>`, which runs in the VPC, and use `dev` for
  everything else. Prefer this unless you need fast iteration on the database
  code itself.
- **Bridge the network for the session.** Use an SSM Session Manager
  port-forward to the database (through an SSM-managed instance or an EC2
  Instance Connect Endpoint in the VPC), or the organization's existing VPN
  or bastion, and point the handler at `localhost` for the session.
