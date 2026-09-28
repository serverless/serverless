# Serverless Framework Agent Skills

Skills in this directory ship inside the Framework CLI. `serverless agent setup`
(or `serverless agent skills install`) installs them — user-scope skills into
the home skill directories, the rest into the project — and auto-update keeps
them current; `serverless agent skills read` prints one on demand. Format: https://agentskills.io — one directory
per skill containing `SKILL.md` (+ optional aux files, e.g. `references/`).

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
