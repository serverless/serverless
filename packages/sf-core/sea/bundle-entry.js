// Bundle entry point for SEA builds.
// esbuild bundles this file, which pulls in the ajv shim first,
// then the actual framework entry point.

// The ajv runtime shim hooks Module._resolveFilename and populates Module._cache
// with all ajv/dist/runtime/* modules. Must run before any ajv standalone code.
import './ajv-runtime-shim.js'

// The actual framework CLI entry point (same as bin/sf-core.js)
import '../bin/sf-core.js'
