import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ServerlessError from '../../../../../serverless-error.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WRAPPERS_DIR = path.join(__dirname, 'wrappers', 'java')
const RIC_VERSION_FILE = path.join(WRAPPERS_DIR, '.version')
const CORE_VERSION_FILE = path.join(WRAPPERS_DIR, '.version-core')
const SERIALIZATION_VERSION_FILE = path.join(
  WRAPPERS_DIR,
  '.version-serialization',
)

// Read once at module init. The `.version*` files are the single source
// of truth for the pinned versions; bumping any dep means updating the
// JAR, LICENSE, NOTICE, and version file together.
const RIC_VERSION = readFileSync(RIC_VERSION_FILE, 'utf8').trim()
const CORE_VERSION = readFileSync(CORE_VERSION_FILE, 'utf8').trim()
const SERIALIZATION_VERSION = readFileSync(
  SERIALIZATION_VERSION_FILE,
  'utf8',
).trim()

/**
 * Absolute path to the vendored AWS Lambda Java Runtime Interface Client
 * JAR. The runner spawns the JVM with this on its classpath alongside the
 * user's compiled artifact.
 */
export const RIC_JAR_PATH = path.join(
  WRAPPERS_DIR,
  `aws-lambda-java-runtime-interface-client-${RIC_VERSION}.jar`,
)

/**
 * Absolute path to the vendored `aws-lambda-java-core` JAR.
 *
 * The RIC depends on this at runtime for the canonical `Context`,
 * `RequestHandler`, `RequestStreamHandler`, and `LambdaLogger`
 * interfaces. We vendor it alongside the RIC because user-built JARs
 * rarely shade `aws-lambda-java-core` (it's a `<scope>provided</scope>`
 * — or `compile`-but-unbundled — Maven dep), and the RIC itself isn't
 * shaded either.
 */
export const CORE_JAR_PATH = path.join(
  WRAPPERS_DIR,
  `aws-lambda-java-core-${CORE_VERSION}.jar`,
)

/**
 * Absolute path to the vendored `aws-lambda-java-serialization` JAR.
 *
 * The RIC's `startRuntime` flow uses this for handler I/O JSON serde
 * (`ReflectUtil`, `LambdaRuntimeLogger` plumbing). The JAR is shaded —
 * it carries its own Jackson — so no separate Jackson vendoring is
 * needed.
 */
export const SERIALIZATION_JAR_PATH = path.join(
  WRAPPERS_DIR,
  `aws-lambda-java-serialization-${SERIALIZATION_VERSION}.jar`,
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
 *   coreJarPath: string,
 *   serializationJarPath: string,
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

  // User artifact first so its classes win on conflicts, then the
  // vendored RIC runtime closure (core interfaces, serialization helper,
  // and the RIC's own main class). The serialization JAR carries shaded
  // Jackson, so no separate Jackson dep is needed.
  const classpath = [
    artifactPath,
    CORE_JAR_PATH,
    SERIALIZATION_JAR_PATH,
    RIC_JAR_PATH,
  ].join(path.delimiter)
  return {
    classpath,
    artifactPath,
    ricJarPath: RIC_JAR_PATH,
    coreJarPath: CORE_JAR_PATH,
    serializationJarPath: SERIALIZATION_JAR_PATH,
  }
}
