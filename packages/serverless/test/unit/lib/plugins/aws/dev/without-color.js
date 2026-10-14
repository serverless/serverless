import { afterAll, beforeAll } from '@jest/globals'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import {
  getColorSettingsForTests,
  setColorSettingsForTests,
} from '@serverless/util/src/logger/index.js'

/**
 * Runs the calling test file without colour, whatever the terminal or FORCE_COLOR say: its tests
 * read the plain text of lines the logger's styles colour. The logger's settings are put back
 * after the file.
 */
export const runWithoutColor = () => {
  let saved
  beforeAll(() => {
    saved = getColorSettingsForTests()
    setColorSettingsForTests({ chalkLevel: 0, colorSupportLevel: 0 })
  })
  afterAll(() => setColorSettingsForTests(saved))
}
