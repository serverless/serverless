// Verbatim esbuild output (--bundle --platform=node --format=cjs — the
// plugin's default format when the service package.json has no
// `type: module`) for an ESM source with a default export AND a named `fetch`
// export:
//
//   const handler = { fetch: async () => new Response('REAL default export') }
//   export default handler
//   export const fetch = async () => new Response('WRONG: stray named export won')
//
// Committed as output rather than rebuilt in the test so the suite pins the
// exact namespace shape `import()` produces for it: the whole export bag lands
// on `default` with an `__esModule` marker, the real default one level deeper,
// and the stray `fetch` right beside it — the shape that must not win.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src.mjs
var src_exports = {};
__export(src_exports, {
  default: () => src_default,
  fetch: () => fetch
});
module.exports = __toCommonJS(src_exports);
var handler = { fetch: async () => new Response("REAL default export") };
var src_default = handler;
var fetch = async () => new Response("WRONG: stray named export won");
// Annotate the CommonJS export names for ESM import in node:
// (esbuild's own inert annotation — the disable is this repo's, not esbuild's)
// eslint-disable-next-line no-constant-binary-expression
0 && (module.exports = {
  fetch
});
