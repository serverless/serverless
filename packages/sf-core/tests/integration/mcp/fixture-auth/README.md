# MCP integration fixture — auth-chain variant

The service `mcp-auth.test.js` deploys, and nothing else:

- `serverless-auth.yml` — bearer auth; `MCP_TEST_AUTH_ISSUER` /
  `MCP_TEST_AUTH_AUDIENCE` env vars are required (no defaults — a missing
  injection fails config resolution instead of deploying a bogus issuer)

## Why this is a separate directory from `../fixture/`

A fixture directory can only serve one test file. Packaging stages
`serverless-mcp/entry.mjs` into the service directory and removes it afterwards,
and `.serverless/` + `node_modules/` are shared state; jest parallelizes test
_files_ with no worker cap, so `mcp.test.js` and `mcp-auth.test.js` pointed at
one directory would concurrently `npm install` into it and stage/unstage the same
entry file. Giving each file its own directory makes that impossible by
construction rather than by a worker-count flag — the auth suite is then free to
run in parallel with the rest of the fleet, which `--runInBand` or
`--maxWorkers=1` would have prevented.

## `src/server.mjs` is a byte-identical copy of `../fixture/src/server.mjs`

Both suites run the same shared check list (`../lib/client.mjs`), so both need
the same tools with the same behaviors. The file is duplicated rather than
imported across directory boundaries so that each fixture stays a self-contained
service, the way a user's project is: an import reaching above the service
directory survives only under a bundler, and would stop this fixture from being
reusable under the `build.esbuild: false` config the sibling exercises.

Parity is enforced, not trusted: `tests/unit/mcp/fixture-parity.test.js` fails
when the two copies (or the two `package.json`s) diverge, so a change to one has
to be mirrored in the same commit. To mirror by hand:

```sh
cp ../fixture/src/server.mjs src/server.mjs
cp ../fixture/package.json package.json
```

`package-lock.json` is compared too, but on its parsed tree rather than
byte-for-byte: npm writes the directory name into the root `name` field, so the
two lockfiles differ by exactly that string and by nothing else. To mirror it,
copy it over and set `name` back to `fixture-auth`:

```sh
cp ../fixture/package-lock.json package-lock.json
# then set the lockfile's root "name" back to "fixture-auth"
```

Other conventions match `../fixture/README.md`: `npm install` (not `ci`) in
`beforeAll`, and `type: commonjs` with ESM `.mjs` sources.
