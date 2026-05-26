export function handler() {
  return {
    AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE:
      process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    _HANDLER: process.env._HANDLER,
    CUSTOM: process.env.CUSTOM,
  }
}
