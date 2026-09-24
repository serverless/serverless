# package.json scripts

Read this when setting up or extending a project's `package.json` scripts:
the bootstrap, deploy, dev, restore, and remove commands of the everyday
lifecycle ([multi-service.md](multi-service.md)). Scripts keep those commands
consistent, so nobody rebuilds them by hand.

`api`, `worker`, and `orders-db` are placeholders for the service names in
`serverless-compose.yml`. `api` and `worker` are the stateless app services;
`orders-db` is the data service that lives once on the `dev` stage.

```json
{
  "scripts": {
    "bootstrap:dev": "serverless deploy --stage dev",
    "deploy:personal-stage": "serverless deploy --service=api,worker --stage ${STAGE:-$USER}",
    "dev:api": "serverless api dev --stage ${STAGE:-$USER}",
    "dev:worker": "serverless worker dev --stage ${STAGE:-$USER}",
    "restore:personal-stage": "serverless deploy --service=api,worker --stage ${STAGE:-$USER}",
    "remove:personal-stage": "serverless remove --service=api,worker --stage ${STAGE:-$USER}",
    "test:unit": "…",
    "test:integration": "STAGE=${STAGE:-$USER} …"
  }
}
```

- `bootstrap:dev`: the full-graph deploy of the shared stage, run once per
  project.
- `deploy:personal-stage`: exactly the app services on your personal stage,
  in dependency order. `orders-db` is not listed, so the shared data service
  is left as it is.
- `dev:<service>`: one dev session per service, each in its own terminal.
- `restore:personal-stage`: deploys the stage again after a dev session, so
  its functions serve the deployed code instead of relaying to a closed
  session.
- `remove:personal-stage`: removes the app services from your personal stage
  only.
- `test:integration`: passes `STAGE=${STAGE:-$USER}` to the test runner, so
  the tests target the same stage as the other scripts.

In a single-service project there is no Compose file and no `--service`
list: use `serverless deploy --stage ${STAGE:-$USER}`,
`serverless dev --stage ${STAGE:-$USER}`, and
`serverless remove --stage ${STAGE:-$USER}`.

## Why the scripts look like this

- **`${STAGE:-$USER}`** gives each developer a stable personal stage named
  after their user. Use `$USER` when it is the developer's name. When it
  isn't, they set `STAGE` in their shell profile (for example
  `export STAGE=alex`), so every session uses the same stage. When you don't
  know their name, or `$USER` is generic (`root`, `ubuntu`), ask them first. For a one-off stage,
  set it for the run, for example `STAGE=feature-x` before
  `npm run deploy:personal-stage`. On Windows, npm runs scripts with
  `cmd.exe`, which doesn't expand `${STAGE:-$USER}`. Either point npm at a
  bash (`npm config set script-shell` with the path to `bash.exe`, which Git
  for Windows installs), or run the `serverless` command with an explicit
  `--stage <name>`.
- **One command per script.** npm appends extra `--` arguments only to the
  last command of a chained script: with the script
  `serverless api deploy && serverless worker deploy`,
  `npm run <script> -- --stage alice` deploys `api` without `--stage`, to the
  default stage. A `--service` list keeps each script a single command.

## Adding a service

- Add a `dev:<service>` script for it.
- Add it to the `--service` lists of `deploy:personal-stage`,
  `restore:personal-stage`, and `remove:personal-stage` **only if it is a
  stateless app service**. A new data service stays out of those lists
  and is read through the pinned `service` resolver
  ([multi-service.md](multi-service.md)).
