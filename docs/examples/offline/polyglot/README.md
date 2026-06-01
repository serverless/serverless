# Polyglot offline app

A single Serverless service exposing two HTTP functions backed by two
different runtimes. The `node` function uses the service-wide
`provider.runtime` (`nodejs20.x`), while the `python` function declares
its own function-level `runtime: python3.12`, which overrides the
provider default.

When you start `serverless offline`, each function is matched to a
runner: the Node function runs in-process (worker-thread), and the
Python function is invoked through a long-lived `python3` child process.
The function-level `runtime:` is what tells offline to pick the
child-process Python runner for that handler.

## Run

```bash
serverless offline
```

## Try it

```bash
curl -s localhost:3000/dev/node
# {"runtime":"node"}

curl -s localhost:3000/dev/python
# {"runtime":"python"}
```

## Prerequisite

The Python route requires `python3` on your `PATH`. Without it, the
Node route still works, but requests to `/dev/python` will fail.
