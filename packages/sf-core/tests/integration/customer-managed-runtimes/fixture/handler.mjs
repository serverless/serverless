import { readFile } from 'node:fs/promises'

// The prerequisite runtime image writes this file; a Lambda-managed runtime
// has none.
const MARKER = '/var/runtime-opt/sls-integration-runtime'

export const main = async () => {
  try {
    return { marker: (await readFile(MARKER, 'utf8')).trim() }
  } catch {
    return { marker: null }
  }
}
