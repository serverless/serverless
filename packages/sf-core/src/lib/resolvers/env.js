import path from 'path'
import { existsSync, statSync } from 'node:fs'
import dotenv from 'dotenv'

/**
 * @typedef {Object} LoadEnvFilesOptions
 * @property {string} [stage] - The name of the stage.
 * @property {string} [configFileDirPath] - The path to the configuration directory.
 * @property {true|string|string[]} [useDotenv] - The user's `useDotenv` config
 *   value. When `true` (or omitted), only local `.env`/`.env.${stage}` files
 *   in `configFileDirPath` are loaded. When a string or array of strings,
 *   each entry is resolved against `configFileDirPath` and loaded as an
 *   additional file (or directory containing `.env`/`.env.${stage}`) with
 *   lower precedence than the local files.
 */

/**
 * Load environment variables from .env and .env.[stageName] files.
 *
 * Local files (always loaded):
 *   1. <configFileDirPath>/.env.${stage}   (if stage provided)
 *   2. <configFileDirPath>/.env
 *
 * Custom files (loaded only when `useDotenv` is a string or array of strings;
 * each entry processed in order):
 *   3. <entry>/.env.${stage}               (if entry is a directory and stage provided)
 *   4. <entry>/.env                        (if entry is a directory)
 *   4'. <entry>                            (if entry is a file)
 *
 * Precedence is established by load order — dotenv.config defaults to
 * first-write-wins (no override). `process.env` set before this function
 * runs always wins, then locals, then custom entries in array order.
 *
 * Missing files at any layer are a silent no-op.
 *
 * @param {LoadEnvFilesOptions} options
 */

export const loadEnvFiles = ({ stage, configFileDirPath, useDotenv } = {}) => {
  if (!configFileDirPath) {
    configFileDirPath = process.cwd()
  }

  // Local files. .env.${stage} is loaded first so it wins over .env
  // (dotenv defaults to first-write-wins).
  if (stage) {
    loadStageEnvFiles({ stage, configFileDirPath })
  }
  const defaultEnvPath = path.resolve(configFileDirPath, '.env')
  if (existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath, quiet: true })
  }

  // Custom paths — only when explicitly provided. Loaded after locals so
  // locals win for shared keys. Within the custom group, earlier array
  // entries win for shared keys (first-write-wins).
  for (const customPath of normalizeCustomPaths(useDotenv)) {
    loadCustomEnvFiles({ stage, configFileDirPath, customPath })
  }
}

/**
 * Load environment variables from .env.[stageName] files.
 * @param {LoadEnvFilesOptions} options - The options for loading environment variables.
 */
export const loadStageEnvFiles = ({ stage, configFileDirPath }) => {
  if (!configFileDirPath) {
    configFileDirPath = process.cwd()
  }
  // Load .env.[stageName] file
  const stageEnvPath = path.resolve(configFileDirPath, `.env.${stage}`)
  if (existsSync(stageEnvPath)) {
    dotenv.config({ path: stageEnvPath, quiet: true })
  }
}

/**
 * Normalize the `useDotenv` config value into the list of custom paths to
 * load. `true` and other non-path values yield no custom paths — the local
 * files are still loaded by `loadEnvFiles`. Strings are wrapped to a
 * one-element array. Arrays are returned as-is.
 *
 * @param {true|string|string[]|undefined} useDotenv
 * @returns {string[]}
 */
const normalizeCustomPaths = (useDotenv) => {
  if (typeof useDotenv === 'string') return [useDotenv]
  if (Array.isArray(useDotenv)) return useDotenv
  return []
}

/**
 * Load environment variables for a single custom path entry. The path is
 * resolved against `configFileDirPath`. If it points to a directory we look
 * inside for `.env.${stage}` (when stage is provided) and `.env`. If it
 * points to a file we load that file directly without stage-suffix logic.
 * Missing files are silently skipped.
 *
 * @param {{ stage?: string, configFileDirPath: string, customPath: string }} options
 */
const loadCustomEnvFiles = ({ stage, configFileDirPath, customPath }) => {
  const resolved = path.resolve(configFileDirPath, customPath)
  if (!existsSync(resolved)) {
    return
  }
  if (statSync(resolved).isDirectory()) {
    if (stage) {
      const stageEnvPath = path.join(resolved, `.env.${stage}`)
      if (existsSync(stageEnvPath)) {
        dotenv.config({ path: stageEnvPath, quiet: true })
      }
    }
    const defaultEnvPath = path.join(resolved, '.env')
    if (existsSync(defaultEnvPath)) {
      dotenv.config({ path: defaultEnvPath, quiet: true })
    }
    return
  }
  dotenv.config({ path: resolved, quiet: true })
}
