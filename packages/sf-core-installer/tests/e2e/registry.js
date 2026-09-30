// A minimal npm registry for the end-to-end tests. It serves one local
// package tarball (the installer under test) and passes every other package
// through from the public registry, rewriting tarball URLs to itself, so the
// package manager under test, and the launcher's own `npm install` of the
// framework release (it inherits npm_config_registry), only ever talk to this
// server. In the proxy-only network test, that leaves the installer's own
// download as the only traffic that has to go through the proxy. It fetches
// from the public registry directly, so it needs direct internet access.
//
// Usage: node registry.js <tarball> [port]
// Listens on 127.0.0.1; set HOST to listen elsewhere (the proxy-only network
// run sets 0.0.0.0). Prints "registry listening on <url>" once ready.

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const path = require('node:path')
const zlib = require('node:zlib')

const UPSTREAM = 'https://registry.npmjs.org'

const [tarballPath, portArg] = process.argv.slice(2)
if (!tarballPath) {
  console.error('usage: node registry.js <tarball> [port]')
  process.exit(2)
}
const tarball = fs.readFileSync(tarballPath)

// Reads package.json out of the npm tarball (a gzipped tar), so the served
// metadata always matches the tarball
const readManifest = (tgz) => {
  const tar = zlib.gunzipSync(tgz)
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/, '')
    const size = parseInt(tar.toString('utf8', offset + 124, offset + 136), 8)
    if (!name) break
    if (name === 'package/package.json') {
      return JSON.parse(tar.toString('utf8', offset + 512, offset + 512 + size))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  throw new Error('package/package.json not found in tarball')
}

const manifest = readManifest(tarball)
const localName = manifest.name
const integrity = `sha512-${crypto.createHash('sha512').update(tarball).digest('base64')}`
const shasum = crypto.createHash('sha1').update(tarball).digest('hex')
const localTarballFile = `${localName}-${manifest.version}.tgz`

const get = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: { accept: 'application/json' } }, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks) }),
        )
        res.on('error', reject)
      })
      .on('error', reject)
  })

const server = http.createServer(async (req, res) => {
  const base = `http://${req.headers.host}`
  const pathname = decodeURIComponent(new URL(req.url, base).pathname)
  try {
    if (pathname === `/${localName}`) {
      const version = manifest.version
      const published = new Date(Date.now() - 30 * 24 * 3600 * 1000)
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(
        JSON.stringify({
          name: localName,
          'dist-tags': { latest: version },
          versions: {
            [version]: {
              ...manifest,
              _id: `${localName}@${version}`,
              dist: {
                tarball: `${base}/${localName}/-/${localTarballFile}`,
                integrity,
                shasum,
              },
            },
          },
          // An old publish date, so release-age gates don't hold it back
          time: {
            created: published.toISOString(),
            modified: published.toISOString(),
            [version]: published.toISOString(),
          },
        }),
      )
    }
    if (pathname === `/${localName}/-/${localTarballFile}`) {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': tarball.length,
      })
      return res.end(tarball)
    }
    // Tarballs of other packages: /<name>/-/<file>.tgz, streamed from upstream
    if (pathname.includes('/-/')) {
      const upstream = await get(`${UPSTREAM}${req.url}`)
      res.writeHead(upstream.status, {
        'content-type': 'application/octet-stream',
      })
      return res.end(upstream.body)
    }
    // Metadata of other packages, with tarball URLs pointing here
    const upstream = await get(`${UPSTREAM}${req.url}`)
    if (upstream.status !== 200) {
      res.writeHead(upstream.status)
      return res.end(upstream.body)
    }
    const text = upstream.body
      .toString('utf8')
      .split(`${UPSTREAM}/`)
      .join(`${base}/`)
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(text)
  } catch (err) {
    res.writeHead(502)
    return res.end(String(err))
  }
})

server.listen(Number(portArg) || 0, process.env.HOST || '127.0.0.1', () => {
  const { port } = server.address()
  console.log(
    `registry listening on http://127.0.0.1:${port} (serving ${localName}@${manifest.version} from ${path.basename(tarballPath)})`,
  )
})
