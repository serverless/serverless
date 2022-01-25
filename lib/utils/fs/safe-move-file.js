'use strict';

const fsp = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

/**
 * Given a path that designates a location of a file on another device,
 * will return a path to file in the same folder, but with a unique name
 * to avoid collisions.
 *
 * @param {*} destPath the path to the final location of the file being moved
 * @returns a unique path to a file on the same device as the file being moved
 */
const generateTemporaryPathOnDestinationDevice = (destPath) => {
  const dirName = path.dirname(destPath);
  // Generate a unique destination file name to get the file onto the destination filesystem
  const tempName = path.basename(destPath) + crypto.randomBytes(8).toString('hex');
  return path.join(dirName, tempName);
};

/**
 * Allows a file to be moved (renamed) even across filesystem boundaries.
 *
 * If the rename fails because the file is getting renamed across file system boundaries,
 * the file is first copied to the destination file system under a temporary name,
 * and then renamed from there.
 *
 * This is done because rename is atomic but copy is not, and can leave partially copied files.
 *
 * @param {*} oldPath the original file that should be moved
 * @param {*} newPath the path to move the file to
 */
async function safeMoveFile(oldPath, newPath) {
  try {
    // Golden path, we simply rename the file in an atomic operation
    await fsp.rename(oldPath, newPath);
  } catch (err) {
    // The EXDEV error indicates that the rename failed because the rename was across filesystem boundaries
    // This might occur if a distro uses tmpfs for temporary directories
    if (err.code === 'EXDEV') {
      // Generate a unique destination file name to get the file onto the destination filesystem
      const tempPath = generateTemporaryPathOnDestinationDevice(newPath);

      // Copy onto the destination filesystem (not guaranteed to be atomic)
      await fsp.copyFile(oldPath, tempPath);
      // Atomically move the file onto the destination path, overwriting it
      await fsp.rename(tempPath, newPath);
      // Delete the old file once both the above operations succeed
      await fsp.unlink(oldPath);
    } else {
      throw err;
    }
  }
}

module.exports = safeMoveFile;
