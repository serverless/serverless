import path from 'path'
import fs from 'fs'
import fse from 'fs-extra'
import ServerlessError from '../../../../serverless-error.js'

// Canonical form of a path for containment comparison: symlinks followed and,
// on case-insensitive filesystems, the on-disk casing. Paths that do not exist
// yet are compared as resolved.
function canonicalize(absolutePath) {
  try {
    return fs.realpathSync.native(absolutePath)
  } catch {
    return absolutePath
  }
}

/**
 * Resolve the user-supplied package path (relative paths are relative to the
 * process cwd, as they always were for these moves) and refuse it when it is
 * the service directory itself or one of its ancestors. The package directory
 * is replaced wholesale when artifacts are moved into it, so for those paths
 * "replace the package directory" would delete the user's project. Returns
 * the absolute package path to use for all filesystem operations, so the
 * check and the operations always refer to the same directory.
 */
function resolvePackagePath(packagePath, serviceDir) {
  const resolvedPackagePath = path.resolve(packagePath)
  // Where the service directory lies, seen from the package directory. It is
  // empty when both are the same directory and a downward path (no leading
  // ".." segment) when the package directory is an ancestor of the service.
  const serviceRelativeToPackage = path.relative(
    canonicalize(resolvedPackagePath),
    canonicalize(serviceDir),
  )
  const isOutsideService =
    serviceRelativeToPackage === '..' ||
    serviceRelativeToPackage.startsWith(`..${path.sep}`) ||
    path.isAbsolute(serviceRelativeToPackage)
  if (!isOutsideService) {
    throw new ServerlessError(
      `The package path "${packagePath}" resolves to the service directory or to a directory containing it (${resolvedPackagePath}). Moving packaged artifacts there would replace the service's own files. Use a directory dedicated to packaged output instead, either inside the service (for example "--package .serverless-package") or outside it (for example "--package ../artifacts").`,
      'PACKAGE_PATH_CONTAINS_SERVICE',
    )
  }
  return resolvedPackagePath
}

/**
 * The package directory the user asked for, validated and absolute, or null
 * when there is nothing to move: no service directory, no explicit
 * `--package` / `package.path`, or a path ending in ".serverless", which
 * designates the default location. The validation runs before that shortcut
 * so an ancestor directory that happens to be named ".serverless" is still
 * refused rather than silently skipped.
 */
function requestedPackagePath(plugin) {
  const { serviceDir } = plugin.serverless
  const requested =
    plugin.options.package || plugin.serverless.service.package.path
  if (!serviceDir || !requested) return null
  const resolvedPackagePath = resolvePackagePath(requested, serviceDir)
  if (requested.endsWith('.serverless')) return null
  return resolvedPackagePath
}

export default {
  async moveArtifactsToPackage() {
    const resolvedPackagePath = requestedPackagePath(this)
    if (!resolvedPackagePath) return

    const serverlessTmpDirPath = path.join(
      this.serverless.serviceDir,
      '.serverless',
    )

    if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
      if (this.serverless.utils.dirExistsSync(resolvedPackagePath)) {
        fse.removeSync(resolvedPackagePath)
      }
      this.serverless.utils.writeFileDir(resolvedPackagePath)
      this.serverless.utils.copyDirContentsSync(
        serverlessTmpDirPath,
        resolvedPackagePath,
      )
      fse.removeSync(serverlessTmpDirPath)
    }
  },

  async moveArtifactsToTemp() {
    const resolvedPackagePath = requestedPackagePath(this)
    if (!resolvedPackagePath) return

    const serverlessTmpDirPath = path.join(
      this.serverless.serviceDir,
      '.serverless',
    )

    if (this.serverless.utils.dirExistsSync(resolvedPackagePath)) {
      if (this.serverless.utils.dirExistsSync(serverlessTmpDirPath)) {
        fse.removeSync(serverlessTmpDirPath)
      }
      this.serverless.utils.writeFileDir(serverlessTmpDirPath)
      this.serverless.utils.copyDirContentsSync(
        resolvedPackagePath,
        serverlessTmpDirPath,
      )
    }
  },
}
