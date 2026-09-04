# MCP integration fixture — dev-mode variant

One service, one config (`serverless.yml`), one stateful server, driven
exclusively by `mcp-dev.test.js`. It is the only fixture a `serverless dev`
session runs against, which is also why it is its own directory: a dev session
deploys, rewrites the deployed handler, watches the source tree and writes
`.serverless/` for as long as it lives, and the test edits `src/server.mjs`
mid-run. None of that can be shared with another suite — see "Why this is a
separate directory" in `../fixture-auth/README.md` for the general rule.

## `src/server.mjs` is NOT a copy of `../fixture/src/server.mjs`

The sibling fixtures duplicate one canonical server because both run the shared
14-check list (`../lib/client.mjs`). This one does not run that list: what it has
to make observable is _which copy of the module answered_ — the local one under
dev mode or the packaged one after a plain deploy — so it carries a single `echo`
tool that reports a `MARKER` constant, and the test rewrites that constant's
line to prove a local edit is picked up without a redeploy. It is therefore
deliberately outside `tests/unit/mcp/fixture-parity.test.js`'s `DIRS` list; the
`package.json` and `package-lock.json` still mirror the sibling's (same server
SDK, same `type: commonjs`), with the lockfile's root `name` set to
`fixture-dev`, the way npm writes it.

`state: true` is kept although no tool seals state: under dev mode the state key
is fetched per request and injected into the LOCAL child, and the
`STATE_KEY_LEN` line the module prints is what makes that reach observable.

Other conventions match `../fixture/README.md`: `npm install` (not `ci`) in
`beforeAll`, and `type: commonjs` with ESM `.mjs` sources.
