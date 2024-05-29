import path from 'path'
import { createRequire } from 'module'
import memoize from 'memoizee'

export default memoize(
  (dirname) => createRequire(path.resolve(dirname, 'require-resolver')),
  {
    primitive: true,
  },
)
