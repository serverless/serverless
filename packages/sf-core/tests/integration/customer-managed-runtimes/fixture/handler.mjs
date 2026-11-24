import { readFile } from 'node:fs/promises'

// The prerequisite runtime image writes this file; a Lambda-managed runtime
// has none.
const MARKER = '/var/runtime-opt/sls-integration-runtime'

// The suite raises this before `deploy function` to see the new code run
const REVISION = 1

export const main = async () => {
  try {
    return {
      marker: (await readFile(MARKER, 'utf8')).trim(),
      revision: REVISION,
    }
  } catch {
    return { marker: null, revision: REVISION }
  }
}
