// Import the dynamic import helper
import importESM from './import-esm.js'

export default async (modPath) => {
  try {
    return await import(modPath)
  } catch (error) {
    // Fallback to import() if the runtime supports native ESM and throws specific error
    if (error.code === 'ERR_REQUIRE_ESM') {
      return (await importESM(modPath)).default
    }
    throw error
  }
}
