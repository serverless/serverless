import { createServer } from 'node:http'
import { URL } from 'node:url'
import { request } from 'node:http'
import { logRequest, generateUUID, matchPath } from './utils.js'

/**
 * Creates and runs the proxy server
 * @param {Object} proxyManager Proxy manager instance
 */
export const runProxyServer = (proxyManager) => {
  const server = createServer(async (req, res) => {
    const proxies = proxyManager.getProxies()

    for (const proxy of proxies) {
      if (matchPath({ pattern: proxy.path, path: req.url })) {
        try {
          const targetURL = new URL(proxy.url)

          // Add AWS Lambda headers if needed
          if (proxy.invokeType === 'awsLambda') {
            const traceId = `Root=1-local-${generateUUID()}`
            req.headers['x-amzn-trace-id'] = traceId
            req.headers['x-forwarded-for'] = '127.0.0.1'
            req.headers['x-forwarded-port'] = '80'
            req.headers['x-forwarded-proto'] = 'http'
            req.headers['x-imforwards'] = '20'

            // Add Lambda context headers
            const requestContext = {
              elb: {
                targetGroupArn:
                  'arn:aws:elasticloadbalancing:region:123456789012:targetgroup/my-target-group/6d0ecf831eec9f09',
              },
            }
            req.headers['x-amzn-request-context'] =
              JSON.stringify(requestContext)

            const lambdaContext = {
              request_id: generateUUID(),
              deadline: Date.now() + 5 * 60 * 1000,
              invoked_function_arn: proxy.invokeType,
              xray_trace_id: traceId,
              client_context: null,
              identity: null,
              env_config: {
                function_name: proxy.service,
                memory: 1024,
                version: '$LATEST',
                log_stream: '',
                log_group: '',
              },
            }
            req.headers['x-amzn-lambda-context'] = JSON.stringify(lambdaContext)
          }

          // Log before proxying
          logRequest({
            service: proxy.service,
            args: [`${req.method} ${req.url} to ${targetURL}`],
            level: 'info',
            skip: process.env.AI_FRAMEWORK ?? false,
          })

          // Forward the request
          const proxyReq = request(
            {
              protocol: targetURL.protocol,
              hostname: targetURL.hostname,
              port: targetURL.port,
              path: req.url,
              method: req.method,
              headers: {
                ...req.headers,
                host: targetURL.host,
              },
            },
            (proxyRes) => {
              // Copy response headers
              Object.entries(proxyRes.headers).forEach(([key, value]) => {
                res.setHeader(key, value)
              })

              // Log after completion
              logRequest({
                service: proxy.service,
                args: [`${req.method} ${req.url} ${proxyRes.statusCode}`],
                level: 'info',
                skip: process.env.AI_FRAMEWORK ?? false,
              })

              // Send response
              res.statusCode = proxyRes.statusCode
              proxyRes.pipe(res)
            },
          )

          proxyReq.on('error', (err) => {
            logRequest({
              service: proxy.service,
              args: [`Error proxying request: ${err.message}`],
              level: 'error',
            })
            res.statusCode = 502
            res.end(err.message)
          })

          // Pipe the request body
          req.pipe(proxyReq)
          return
        } catch (err) {
          logRequest({
            service: proxy.service,
            args: [`Error proxying request: ${err.message}`],
            level: 'error',
          })
          res.statusCode = 502
          res.end(err.message)
          return
        }
      }
    }

    // Handle custom domain fallback
    const customDomain = process.argv[2]
    if (customDomain) {
      const protocol = customDomain.includes('elb.amazonaws.com')
        ? 'http://'
        : 'https://'
      const targetURL = new URL(protocol + customDomain)

      try {
        const proxyReq = request(
          {
            protocol: targetURL.protocol,
            hostname: targetURL.hostname,
            port: targetURL.port,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: targetURL.host,
            },
          },
          (proxyRes) => {
            Object.entries(proxyRes.headers).forEach(([key, value]) => {
              res.setHeader(key, value)
            })

            res.statusCode = proxyRes.statusCode
            proxyRes.pipe(res)
          },
        )

        proxyReq.on('error', (err) => {
          res.statusCode = 502
          res.end(err.message)
        })

        req.pipe(proxyReq)
        return
      } catch (err) {
        res.statusCode = 502
        res.end(err.message)
        return
      }
    }

    res.statusCode = 404
    res.end('Not Found')
  })

  // Read the proxy port from environment variables (default to 3000)
  const proxyPort = process.env.PROXY_PORT
    ? parseInt(process.env.PROXY_PORT, 10)
    : 3000
  server.listen(proxyPort, () => {
    logRequest({
      args: [`Proxy server listening on port ${proxyPort}`],
      level: 'info',
    })
  })
}
