exports.handler = async (event) => {
  return {
    SAM_OUTPUT_PARAM: process.env.SAM_OUTPUT_PARAM,
  }
}
