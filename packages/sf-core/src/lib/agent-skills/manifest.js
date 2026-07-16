/* global __SF_SKILLS_MANIFEST__ */
/**
 * Bundled skills access. Mirrors the __SF_CORE_VERSION__ pattern
 * (see src/utils/fs/index.js getVersions):
 *  1. Production: injected at build time by esbuild `define`.
 *  2. Source runs / tests: read <repo-root>/skills/ live from disk.
 */
import { readSkillsFromDir } from './read-skills.js'

export const getBundledSkills = async () => {
  if (typeof __SF_SKILLS_MANIFEST__ !== 'undefined') {
    return __SF_SKILLS_MANIFEST__
  }
  // packages/sf-core/src/lib/agent-skills/ → repo root is 5 levels up
  return readSkillsFromDir(new URL('../../../../../skills/', import.meta.url))
}
