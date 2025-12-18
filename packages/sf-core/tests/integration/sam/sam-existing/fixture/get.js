exports.handler = async (event) => {
  return { TEST_ENV: process.env.TEST_ENV }
}
