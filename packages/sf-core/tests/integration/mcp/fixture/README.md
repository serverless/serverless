# MCP integration fixture

One service, two selectable configs (`-c`), driven exclusively by `mcp.test.js`:

- `serverless.yml` — esbuild bundling, two servers (`crm` with `state: true`, `docs` stateless)
- `serverless-classic.yml` — `build.esbuild: false`, single stateful server

The enforcement-and-discovery variant lives in the sibling `../fixture-auth/`
directory, not here, because two test files cannot share one fixture directory — see
"One suite per fixture directory" below and `../fixture-auth/README.md`.

Constraints for suites using this fixture:

- **One suite per fixture directory, serialized within that suite.** Packaging
  stages `serverless-mcp/entry.mjs` into this directory and removes it
  afterwards, and `.serverless/` + `node_modules/` are shared, so two jest
  workers running from one directory race each other. Jest parallelizes test
  _files_ with no worker cap, so a second test file pointed at this directory
  would be exactly that race: keep it to one file per directory (ordered
  `test()` steps inside a file are serial).
- Run `npm install` here (not `ci`) in `beforeAll`, per the esbuild-fixture precedent.
- `type: commonjs` is deliberate (esbuild emits CJS — the live-proven combination,
  and it exercises the entry's double-default interop branch). The `format: esm`
  bundle shape (a real `type: module` service) is a recorded coverage gap — add a
  third config if it needs live coverage.
- To assert sealed state live, the caller must echo `result.requestState` back on
  the accept leg — the tool appends `(state verified)` only then.
