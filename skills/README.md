# Serverless Framework Agent Skills

Skills in this directory ship inside the Framework CLI. `serverless agent setup`
(or `serverless agent skills install`) installs them — user-scope skills into
the home skill directories, the rest into the project — and auto-update keeps
them current; `serverless agent skills read` prints one on demand. Format: https://agentskills.io — one directory
per skill containing `SKILL.md` (+ optional aux files, e.g. `references/`).

## Also published as an agent plugin

`serverless-framework` also ships, unchanged, in the public agent plugin
https://github.com/serverless/agent-plugins (Claude Code, Codex, GitHub Copilot
CLI, Gemini CLI). A workflow there copies `skills/serverless-framework/` from
each `sf-core@x.y.z` release and publishes a new plugin version, so a change
here reaches plugin users with the next Framework release. Make skill changes
here, never in the plugin repo. The CLI compares `metadata.version` with the
plugin's copy to decide whether to install its own copy next to a Claude Code
plugin, so the version bump below matters for plugin users too.

## Frontmatter contract (CI-enforced)

    ---
    name: <must equal directory name>
    description: <non-empty, ≤1024 chars>
    metadata:
      managed-by: serverless-framework   # required — update/ownership marker
      version: "1"                       # integer string; bump on EVERY content change
      scope: user                        # optional: user | project (default project)
      author: Serverless Inc.            # optional
    ---

Rules:

- Bump `metadata.version` whenever content changes, then run
  `node packages/sf-core/scripts/lint-skills.js --update` and commit
  `skills/manifest.json` alongside. CI fails otherwise.
- Aux files are never deleted from user installs — add/rename files rather
  than repurposing existing names.
- `scope: user` installs the skill into the user's home skill directories
  (`agent setup`) instead of the project; skills without it are project
  skills.
