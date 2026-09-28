# Commands built for agents

All of these run non-interactively and never prompt. `agent setup`,
`agent docs` and `agent skills` need no sign-in and no AWS credentials and run
from any directory; `agent inspect` and `serverless dev` need both.

## `serverless agent setup`

Installs this skill at the user level and, inside a service directory, the
Framework's project skills into the project (each one loads only when a task
involves its feature, including adding it to the service; they are meant to
be committed, and deployments leave them out). Ends with an
`environment:` report — service presence, Serverless authentication, AWS
credentials — where every failing line carries its fix, then a `docs:` line
pointing to this skill. Idempotent: re-run it whenever you are unsure of the
environment.

## `serverless agent docs [path ...]`

Prints the Serverless Framework documentation that ships with the installed
CLI, so it always matches the version you are running and works offline.

- No arguments: the page index, grouped by section, with the path to pass and
  an approximate size per page.
- One or more paths from the index: the pages, as markdown. Several pages are
  printed under `## <path>` headings.

Prefer this over fetching the website: the website documents the latest
release, not necessarily the one installed.

## `serverless agent skills list` and `serverless agent skills read <name> [file]`

The CLI bundles project skills, one per feature (for example `serverless-sandboxes`,
`serverless-mcp`). `list` shows them with their descriptions; `read` prints a
skill's `SKILL.md`, or one of its reference files, without installing
anything. Use `read` when you need a feature's procedural knowledge in a
project where the skill is not installed. `agent setup` installs the skills;
`serverless agent skills install` installs them the same way, without the
environment report.

## `serverless agent inspect`

Shows what is actually deployed: a cheap index of the stack's resources by
default, or the live AWS configuration of selected resource categories (for
example `--functions`, `--api`, `--events`, `--iam`, `--storage`,
`--observability`, or `--all` for every category). It reports what is
deployed: read it against `serverless.yml` to verify a deploy did what the
config says, and use `serverless diff` for a change-by-change comparison
before deploying. Run it in a service directory, or in a Compose project as
`serverless <service> agent inspect` from the root; it needs sign-in and AWS
credentials.

## `serverless mcp`

An MCP server exposing the deployed service to AI clients: service summary,
stack resources, function/API/queue/table details, log search and tail,
CloudWatch alarms, deployment history, and docs lookup. stdio by default.

Register it in Claude Code:

```bash
claude mcp add serverless -- serverless mcp
```

For other MCP clients, use the equivalent `mcpServers` entry:

```json
{
  "mcpServers": {
    "serverless": { "command": "serverless", "args": ["mcp"] }
  }
}
```

When `serverless` is not on the PATH, use `npx -y serverless mcp` instead
([cli.md](cli.md)).

## `serverless dev`

Dev Mode: connects the deployed service to local code, so invocations
of the real AWS endpoints run the local handler and changes are testable
without redeploying. Run it in a service directory; it needs sign-in and AWS
credentials. The first start deploys the stage itself; in a Compose project,
the services it reads from must already be deployed.
