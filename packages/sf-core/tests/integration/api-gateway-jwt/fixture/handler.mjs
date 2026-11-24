// Echoes what API Gateway passed on from the JWT authorizer, so the suite can
// check which requests reached the function and with which claims.
export const handler = async (event) => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    path: event.path,
    authorizer: event.requestContext?.authorizer ?? null,
  }),
})
