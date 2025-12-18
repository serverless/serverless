exports.handler = async (event) => {
  return {
    FRAMEWORK_OUTPUT_PARAM: process.env.FRAMEWORK_OUTPUT_PARAM,
  }
}
