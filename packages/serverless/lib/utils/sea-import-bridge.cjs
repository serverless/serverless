// Bridge for loading external modules from SEA context.
// When loaded via createRequire() from the SEA entry, this module runs under
// the normal filesystem loader — not the SEA-restricted loader.
// Its import() can therefore load external ESM and CJS files from disk.
module.exports = (url) => import(url);
