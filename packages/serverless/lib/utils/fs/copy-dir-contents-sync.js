import fse from 'fs-extra'

const isNotSymbolicLink = (src) => !fse.lstatSync(src).isSymbolicLink()

/** `filter(source)`, when given, leaves out what it returns false for (and, for a directory, all of it). */
function copyDirContentsSync(
  srcDir,
  destDir,
  { noLinks = false, filter = null } = {},
) {
  const filters = [noLinks && isNotSymbolicLink, filter].filter(Boolean)
  const copySyncOptions = {
    dereference: true,
    filter: filters.length
      ? (source) => filters.every((keep) => keep(source))
      : null,
  }
  fse.copySync(srcDir, destDir, copySyncOptions)
}

export default copyDirContentsSync
