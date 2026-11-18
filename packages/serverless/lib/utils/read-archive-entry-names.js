import { open } from 'fs/promises'

/**
 * The entry names a finished archive actually contains, read back out of its
 * central directory.
 *
 * A check against the list packaging MEANT to write would let an entry
 * archiver dropped, renamed while sanitizing, or never flushed sail straight
 * through, so the names are read off the file on disk instead.
 *
 * Only the directory itself is read, never the archive body — a Lambda
 * artifact runs to hundreds of megabytes and loading it into a buffer to
 * answer "which names are in here" is not affordable. ZIP64 is handled
 * because it is genuinely reachable: archiver switches to it above 65535
 * entries, which a real `node_modules` passes easily.
 *
 * Returns `null` rather than throwing if the archive cannot be read as
 * expected, so a caller can fall back to what it intended to write: a check
 * built on this must never be the thing that invents a missing entry.
 *
 * @param {string} zipPath
 * @returns {Promise<Set<string>|null>}
 */
export async function readArchiveEntryNames(zipPath) {
  let handle
  try {
    handle = await open(zipPath, 'r')
    const { size } = await handle.stat()

    // The end-of-central-directory record is last, but a trailing comment
    // (up to 64KiB) can sit behind it, so scan back over that window.
    const tailLength = Math.min(size, 22 + 0xffff)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, size - tailLength)

    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd === -1) return null

    let entryCount = tail.readUInt16LE(eocd + 10)
    let directorySize = tail.readUInt32LE(eocd + 12)
    let directoryOffset = tail.readUInt32LE(eocd + 16)

    // Any of the three saturated means the real values live in the ZIP64
    // record, found through the locator that sits immediately before the
    // classic one.
    if (
      entryCount === 0xffff ||
      directorySize === 0xffffffff ||
      directoryOffset === 0xffffffff
    ) {
      const locator = eocd - 20
      if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) return null
      const zip64Offset = Number(tail.readBigUInt64LE(locator + 8))
      const zip64 = Buffer.alloc(56)
      await handle.read(zip64, 0, 56, zip64Offset)
      if (zip64.readUInt32LE(0) !== 0x06064b50) return null
      entryCount = Number(zip64.readBigUInt64LE(32))
      directorySize = Number(zip64.readBigUInt64LE(40))
      directoryOffset = Number(zip64.readBigUInt64LE(48))
    }

    // Every figure above comes off the file being read, so none of them can
    // be trusted to be sane. The central directory lives inside the archive
    // and each of its records is at least 46 bytes; anything else means the
    // record was misread, and allocating on it would abort the whole CLI
    // with an out-of-memory crash rather than fail this one check.
    if (
      directoryOffset < 0 ||
      directorySize < 0 ||
      directoryOffset + directorySize > size ||
      entryCount < 0 ||
      entryCount * 46 > directorySize
    ) {
      return null
    }

    const directory = Buffer.alloc(directorySize)
    await handle.read(directory, 0, directorySize, directoryOffset)

    const names = new Set()
    let offset = 0
    for (let i = 0; i < entryCount; i += 1) {
      if (offset + 46 > directory.length) return null
      if (directory.readUInt32LE(offset) !== 0x02014b50) return null
      const nameLength = directory.readUInt16LE(offset + 28)
      const extraLength = directory.readUInt16LE(offset + 30)
      const commentLength = directory.readUInt16LE(offset + 32)
      names.add(
        directory.toString('utf8', offset + 46, offset + 46 + nameLength),
      )
      offset += 46 + nameLength + extraLength + commentLength
    }
    return names
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}
