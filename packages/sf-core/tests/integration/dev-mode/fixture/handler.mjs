export const handler = async () => ({
  marker: 'deployed',
  runtimeApi: process.env.AWS_LAMBDA_RUNTIME_API,
  chained: process.env.SLS_TEST_CHAINED ?? null,
})
