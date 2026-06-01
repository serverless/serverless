// Single-function WebSocket chat for the offline example. All routes map to
// this one Lambda so the in-memory connection registry is shared (a demo store
// — real apps persist connection ids in DynamoDB).
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'

const connections = new Set()

export const ws = async (event) => {
  const { routeKey, connectionId, domainName, stage } = event.requestContext

  if (routeKey === '$connect') {
    connections.add(connectionId)
    return { statusCode: 200 }
  }

  if (routeKey === '$disconnect') {
    connections.delete(connectionId)
    return { statusCode: 200 }
  }

  // broadcast: fan the message out to every connected client.
  const client = new ApiGatewayManagementApiClient({
    endpoint: `http://${domainName}/${stage}`,
  })
  const body = JSON.parse(event.body || '{}')
  const payload = Buffer.from(JSON.stringify({ msg: body.msg }))
  await Promise.all(
    [...connections].map((id) =>
      client
        .send(new PostToConnectionCommand({ ConnectionId: id, Data: payload }))
        .catch(() => connections.delete(id)),
    ),
  )
  return { statusCode: 200 }
}
