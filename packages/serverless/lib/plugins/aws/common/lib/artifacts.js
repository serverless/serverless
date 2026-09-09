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
 * Resolve the user-supplied package path against the service directory and
 * refuse it when it is the service directory itself or one of its ancestors.
 * The package directory is replaced wholesale when artifacts are moved into
 * it, so for those paths "replace the package directory" would delete the
 * user's project. Returns the absolute package path to use for all
 * filesystem operations, so the check and the operations agree on which
 * directory is meant regardless of the process cwd.
 */
function resolvePackagePath(packagePath, serviceDir) {
  const resolvedPackagePath = path.resolve(serviceDir, packagePath)
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

export default {
  async moveArtifactsToPackage() {
    const packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir || '.', '.serverless')

    // Only move the artifacts if it was requested by the user
    if (this.serverless.serviceDir && !packagePath.endsWith('.serverless')) {
      const resolvedPackagePath = resolvePackagePath(
        packagePath,
        this.serverless.serviceDir,
      )
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
    }
  },

  async moveArtifactsToTemp() {
    const packagePath =
      this.options.package ||
      this.serverless.service.package.path ||
      path.join(this.serverless.serviceDir || '.', '.serverless')

    // Only move the artifacts if it was requested by the user
    if (this.serverless.serviceDir && !packagePath.endsWith('.serverless')) {
      const resolvedPackagePath = resolvePackagePath(
        packagePath,
        this.serverless.serviceDir,
      )
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
    }
  },
}
