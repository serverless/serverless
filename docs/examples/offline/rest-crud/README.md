# REST CRUD example for `serverless offline`

A minimal REST API with three routes backed by an in-memory store, runnable
entirely locally with `serverless offline`.

## Run

```bash
serverless offline
```

This boots the local app server (default app port `3000`) and prints the
registered REST API routes.

## Routes

REST API v1 routes are mounted under the stage, so the local URLs carry the
`dev` stage segment. With the default stage the routes are reachable at
`localhost:3000/devitems`:

```bash
# Create an item
curl -s -XPOST localhost:3000/devitems \
  -d '{"name":"a"}' -H 'content-type: application/json'
# → {"id":"1","name":"a"}

# List items
curl -s localhost:3000/devitems
# → [...]

# Get an item by id
curl -s localhost:3000/devitems/1
# → {"id":"1","name":"a"}
```

## What you should see

The `POST` returns `201` with the created item (an auto-assigned string `id`
plus your posted fields). The `GET` list and `GET` by id read from the same
in-memory store within their own function.

Note: each function (`create`, `get`, `list`) runs as a separate Lambda, so the
in-memory `Map` in `handler.js` is per-function — it is not shared across the
three routes, exactly as it would not be on AWS. For a store shared across
routes, back the handlers with a real data store (e.g. DynamoDB) or collapse
the CRUD operations into a single function.
