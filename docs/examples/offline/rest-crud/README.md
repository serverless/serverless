# REST CRUD example for `serverless offline`

A minimal REST CRUD API runnable entirely locally with `serverless offline`. All
three routes are handled by a single Lambda function, so the in-memory store is
shared across requests for the life of the offline process. This keeps the demo
self-contained; a production app would back the routes with a real datastore
(e.g. DynamoDB) instead of process memory.

## Run

```bash
serverless offline
```

This boots the local app server (default app port `3000`) and prints the
registered REST API routes. The routes mount under the stage, so with the
default `dev` stage they are reachable at `localhost:3000/dev/items`.

## Try it

```bash
# Create an item
curl -s -XPOST localhost:3000/dev/items -d '{"name":"a"}' -H 'content-type: application/json'

# List items
curl -s localhost:3000/dev/items

# Get an item by id
curl -s localhost:3000/dev/items/1
```

## What you should see

Creating an item returns `201` with the created item (an auto-assigned string
`id` plus your posted fields), e.g. `{"id":"1","name":"a"}`. Listing then
returns an array containing it, e.g. `[{"id":"1","name":"a"}]` — because every
route shares the same in-memory store. Getting it by id returns the single item,
and requesting an unknown id (e.g. `localhost:3000/dev/items/999`) returns `404`
with `{"message":"Not found"}`.
