# Serverless Framework Agent Skills

Skills in this directory ship inside the Framework CLI and are installed into
users' service directories by `serverless agent skills install` (and kept
current by auto-update). Format: https://agentskills.io — one directory per
skill containing `SKILL.md` (+ optional aux files, e.g. `references/`).

## Frontmatter contract (CI-enforced)

    ---
    name: <must equal directory name>
    description: <non-empty, ≤1024 chars>
    metadata:
      managed-by: serverless-framework   # required — update/ownership marker
      version: "1"                       # integer string; bump on EVERY content change
      author: Serverless Inc.            # optional
    ---

Rules:

- Bump `metadata.version` whenever content changes, then run
  `node packages/sf-core/scripts/lint-skills.js --update` and commit
  `skills/manifest.json` alongside. CI fails otherwise.
- Aux files are never deleted from user installs — add/rename files rather
  than repurposing existing names.
