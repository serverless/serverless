import fs from 'fs'
import path from 'path'
import vm from 'vm'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

// Custom resource handlers are CommonJS that only runs inside Lambda, while this
// package is ESM, so compile them as CommonJS with a stubbed `require`
const loadCommonJs = (filePath, stubs) => {
  const module = { exports: {} }
  const localRequire = (id) => {
    if (id in stubs) return stubs[id]
    if (id.startsWith('.')) {
      return loadCommonJs(
        path.resolve(path.dirname(filePath), `${id}.js`),
        stubs,
      )
    }
    return nodeRequire(id)
  }
  vm.compileFunction(
    fs.readFileSync(filePath, 'utf8'),
    ['exports', 'require', 'module', '__filename', '__dirname'],
    { filename: filePath },
  )(module.exports, localRequire, module, filePath, path.dirname(filePath))
  return module.exports
}

export default loadCommonJs
