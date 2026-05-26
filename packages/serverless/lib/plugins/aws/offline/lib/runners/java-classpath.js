import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ServerlessError from '../../../../../serverless-error.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const VERSION_FILE = path.join(__dirname, 'wrappers', 'java', '.version')

// Read once at module init. The `.version` file is the single source of
// truth for the pinned RIC version; bumping the dep means updating the
// JAR, LICENSE, NOTICE, and `.version` together.
const PINNED_VERSION = readFileSync(VERSION_FILE, 'utf8').trim()

/**
 * Absolute path to the vendored AWS Lambda Java Runtime Interface Client
 * JAR. The runner spawns the JVM with this on its classpath alongside the
 * user's compiled artifact.
 */
export const RIC_JAR_PATH = path.join(
  __dirname,
  'wrappers',
  'java',
  `aws-lambda-java-runtime-interface-client-${PINNED_VERSION}.jar`,
)

/**
 * Assemble the JVM `-cp` argument value from the user's compiled artifact
 * and the vendored RIC JAR.
 *
 * The user is responsible for producing `artifactPath` via `mvn package`
 * or `gradle build`. The runner does not invoke a build tool.
 *
 * @param {object} options
 * @param {string} options.functionKey  Used only for error messages.
 * @param {string | null | undefined} options.artifactPath  Absolute path
 *   to the user's compiled JAR. Missing/non-existent → throws
 *   `OFFLINE_JAVA_ARTIFACT_MISSING`.
 *
 * @returns {Promise<{
 *   classpath: string,
 *   artifactPath: string,
 *   ricJarPath: string,
 * }>}
 */
export async function resolveClasspath({ functionKey, artifactPath }) {
  if (!artifactPath) {
    throw new ServerlessError(
      `Java artifact not declared for function ${functionKey}. ` +
        `Set "package.artifact" to the path of your compiled JAR ` +
        `(e.g. "target/${functionKey}-1.0.jar") and run "mvn package" ` +
        `(or your gradle equivalent) before "sls offline".`,
      'OFFLINE_JAVA_ARTIFACT_MISSING',
    )
  }

  try {
    await fs.access(artifactPath)
  } catch {
    throw new ServerlessError(
      `Java artifact not found at ${artifactPath} for function ${functionKey}. ` +
        `Run "mvn package" (or your gradle equivalent) before "sls offline".`,
      'OFFLINE_JAVA_ARTIFACT_MISSING',
    )
  }

  return {
    classpath: `${artifactPath}${path.delimiter}${RIC_JAR_PATH}`,
    artifactPath,
    ricJarPath: RIC_JAR_PATH,
  }
}
