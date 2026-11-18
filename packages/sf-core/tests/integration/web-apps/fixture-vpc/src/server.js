import http from 'node:http'
import net from 'node:net'

// Opens a TCP connection to the VPC's DNS resolver, which only a network
// interface inside the VPC can reach.
const reachesVpcResolver = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host: process.env.VPC_RESOLVER, port: 53 })
    const done = (connected) => {
      socket.destroy()
      resolve(connected)
    }
    socket.setTimeout(3000, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })

http
  .createServer(async (req, res) => {
    const body = { app: process.env.APP_NAME }
    if (req.url === '/vpc') body.vpcResolver = await reachesVpcResolver()
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  .listen(process.env.PORT ?? 3000)
