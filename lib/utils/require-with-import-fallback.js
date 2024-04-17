export default async (modPath) => {
  try {
    return require(modPath);
  } catch (error) {
    // Fallback to import() if the runtime supports native ESM
    if (error.code === 'ERR_REQUIRE_ESM') {
      return (await require('./import-esm.js')(modPath)).default;
    }
    throw error;
  }
};
