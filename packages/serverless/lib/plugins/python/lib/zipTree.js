import fse from 'fs-extra'
import path from 'path'

/**
 * Add a directory recursively to a zip file. Files in src will be added to the top folder of zip.
 * @param {JSZip} zip a zip object in the folder you want to add files to.
 * @param {string} src the source folder.
 * @return {Promise} a promise offering the original JSZip object.
 */
async function addTree(zip, src) {
  const srcN = path.normalize(src)
  const names = await fse.readdir(srcN)
  for (const name of names) {
    const srcPath = path.join(srcN, name)
    const stat = await fse.stat(srcPath)
    if (stat.isDirectory()) {
      await addTree(zip.folder(name), srcPath)
    } else {
      const opts = { date: stat.mtime, unixPermissions: stat.mode }
      const data = await fse.readFile(srcPath)
      zip.file(name, data, opts)
    }
  }
  return zip
}

/**
 * Write zip contents to a file.
 * @param {JSZip} zip the zip object
 * @param {string} targetPath path to write the zip file to.
 * @return {Promise} a promise resolving to null.
 */
function writeZip(zip, targetPath) {
  const opts = {
    platform: process.platform == 'win32' ? 'DOS' : 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9,
    },
  }
  return new Promise((resolve) => {
    zip
      .generateNodeStream(opts)
      .pipe(fse.createWriteStream(targetPath))
      .on('finish', resolve)
  }).then(() => null)
}

/**
 * Add a new file to a zip file from a buffer.
 * @param {JSZip} zip the zip object to add the file to.
 * @param {string} zipPath the target path in the zip.
 * @param {Promise} bufferPromise a promise providing a nodebuffer.
 * @return {Promise} a promise providing the JSZip object.
 * @param {object} fileOpts an object with the opts to save for the file in the zip.
 */
async function zipFile(zip, zipPath, bufferPromise, fileOpts) {
  const buffer = await bufferPromise
  zip.file(
    zipPath,
    buffer,
    Object.assign(
      {},
      {
        // necessary to get the same hash when zipping the same content
        date: new Date(0),
      },
      fileOpts,
    ),
  )
  return zip
}

export { addTree, writeZip, zipFile }
