/**
 * The Agent Skills that `serverless agent setup` installs into a service, one
 * copy per agent directory. They guide the developer's coding agent and never
 * belong in a function artifact, so every packaging path leaves them out by
 * default. The globs name only the Framework's own skills (all `serverless-*`),
 * so a skill a service ships on purpose -- an agent that runs in Lambda --
 * is packaged as before; `package.patterns` can re-include either.
 */
export const AGENT_SKILL_EXCLUDES = [
  '.claude/skills/serverless-*/**',
  '.agents/skills/serverless-*/**',
]
