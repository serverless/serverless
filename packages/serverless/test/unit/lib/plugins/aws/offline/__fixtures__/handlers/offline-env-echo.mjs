export function handler() {
  return {
    IS_OFFLINE: process.env.IS_OFFLINE,
    AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
    AWS_REGION: process.env.AWS_REGION,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AUTHORIZER: process.env.AUTHORIZER,
  }
}
