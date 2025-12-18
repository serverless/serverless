import ensureNaturalNumber from 'type/natural-number/ensure.js'
import { filesize } from 'filesize'

const resolveSignificant = (size) => {
  return size >= 1000 ? resolveSignificant(Math.floor(size / 1000)) : size
}

export default (size) =>
  filesize(size, {
    round:
      resolveSignificant(ensureNaturalNumber(size, { name: 'size' })) >= 9
        ? 0
        : 1,
  })
