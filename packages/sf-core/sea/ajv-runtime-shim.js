// =============================================================================
// ajv-runtime-shim.js — Make ajv standalone-generated validators work in SEA
// =============================================================================
//
// ajv's standaloneCode() generates validators with require("ajv/dist/runtime/...")
// calls. In a SEA, ajv is bundled (no node_modules on disk), so those fail.
//
// This shim:
// 1. Pre-requires all ajv runtime modules (esbuild inlines them at bundle time)
// 2. Hooks Module._resolveFilename to intercept those require paths
// 3. Pre-populates Module._cache so they resolve from memory
//
// Must be imported BEFORE any ajv standalone code is loaded.

'use strict'

const Module = require('module')

const AJV_RUNTIME_MODULES = {}

function safeRequire(id) {
  try {
    return require(id)
  } catch {
    return undefined
  }
}

const modules = {
  'ajv/dist/runtime/equal': require('ajv/dist/runtime/equal'),
  'ajv/dist/runtime/ucs2length': require('ajv/dist/runtime/ucs2length'),
  'ajv/dist/runtime/uri': require('ajv/dist/runtime/uri'),
  'ajv/dist/runtime/validation_error': require('ajv/dist/runtime/validation_error'),
  'ajv/dist/runtime/quote': require('ajv/dist/runtime/quote'),
  'ajv/dist/runtime/re2': safeRequire('ajv/dist/runtime/re2'),
  'ajv/dist/runtime/timestamp': require('ajv/dist/runtime/timestamp'),
  'ajv/dist/runtime/parseJson': require('ajv/dist/runtime/parseJson'),
  'ajv-formats/dist/formats': require('ajv-formats/dist/formats'),
}

for (const [key, mod] of Object.entries(modules)) {
  if (mod !== undefined) AJV_RUNTIME_MODULES[key] = mod
}

const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request in AJV_RUNTIME_MODULES) {
    return `__sea_bundled__:${request}`
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

for (const [modulePath, moduleExports] of Object.entries(AJV_RUNTIME_MODULES)) {
  const virtualFilename = `__sea_bundled__:${modulePath}`
  const m = new Module(virtualFilename)
  m.exports = moduleExports
  m.loaded = true
  Module._cache[virtualFilename] = m
}
