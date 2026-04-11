const os = require('os')
const { ProxyAgent } = require('undici')

const { existsSync, mkdirSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const rimraf = require('rimraf')

const error = (msg) => {
  console.error(msg)
  process.exit(1)
}

const formatHostName = (hostname) => hostname.replace(/^\.*/, '.').toLowerCase()

const parseNoProxyZone = (zone) => {
  zone = zone.trim()
  const zoneParts = zone.split(':', 2)
  const zoneHost = formatHostName(zoneParts[0])
  const zonePort = zoneParts[1]
  const hasPort = zone.indexOf(':') > -1
  return { hostname: zoneHost, port: zonePort, hasPort }
}

const shouldBypassProxy = (requestURL) => {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || ''
  if (noProxy === '*') return true
  if (noProxy === '') return false

  const port =
    requestURL.port || (requestURL.protocol === 'https:' ? '443' : '80')
  const hostname = formatHostName(requestURL.hostname)

  return noProxy
    .split(',')
    .map(parseNoProxyZone)
    .some((noProxyZone) => {
      const isMatchedAt = hostname.indexOf(noProxyZone.hostname)
      const hostnameMatched =
        isMatchedAt > -1 &&
        isMatchedAt === hostname.length - noProxyZone.hostname.length
      if (noProxyZone.hasPort) {
        return port === noProxyZone.port && hostnameMatched
      }
      return hostnameMatched
    })
}

const getProxyUrl = (url) => {
  const requestURL = new URL(url)

  if (shouldBypassProxy(requestURL)) return null

  if (requestURL.protocol === 'http:') {
    return process.env.HTTP_PROXY || process.env.http_proxy || null
  }
  if (requestURL.protocol === 'https:') {
    return process.env.HTTPS_PROXY || process.env.https_proxy || null
  }
  return null
}

class Binary {
  constructor(name, url, version, config) {
    const errors = []
    if (typeof url !== 'string') {
      errors.push('url must be a string')
    } else {
      try {
        new URL(url)
      } catch (e) {
        errors.push(e)
      }
    }
    if (name && typeof name !== 'string') {
      errors.push('name must be a string')
    }

    if (version && typeof version !== 'string') {
      errors.push('version must be a string')
    }

    if (!name) {
      errors.push('You must specify the name of your binary')
    }

    if (!version) {
      errors.push('You must specify the version of your binary')
    }

    if (
      config &&
      config.installDirectory &&
      typeof config.installDirectory !== 'string'
    ) {
      errors.push('config.installDirectory must be a string')
    }

    if (errors.length > 0) {
      let errorMsg =
        'One or more of the parameters you passed to the Binary constructor are invalid:\n'
      errors.forEach((error) => {
        errorMsg += error
      })
      errorMsg +=
        '\n\nCorrect usage: new Binary("my-binary", "https://example.com/binary/download.tar.gz", "v1.0.0")'
      error(errorMsg)
    }
    this.url = url
    this.name = name
    this.version = version
    this.installDirectory =
      config?.installDirectory || join(__dirname, 'node_modules', '.bin')

    if (!existsSync(this.installDirectory)) {
      mkdirSync(this.installDirectory, { recursive: true })
    }

    this.binaryPath = join(
      this.installDirectory,
      `${this.name}-${this.version}`,
    )
  }

  exists() {
    return existsSync(this.binaryPath)
  }

  removeBinary() {
    try {
      rmSync(this.binaryPath)
    } catch (err) {
      /** Empty **/
    }
  }

  install(suppressLogs = false) {
    if (this.exists()) {
      if (!suppressLogs) {
        console.error(
          `${this.name} is already installed, skipping installation.`,
        )
      }
      return Promise.resolve()
    }

    if (existsSync(this.installDirectory)) {
      rimraf.sync(this.installDirectory)
    }

    mkdirSync(this.installDirectory, { recursive: true })

    if (!suppressLogs) {
      console.error(`Downloading release from ${this.url}`)
    }

    process.on('SIGINT', () => {
      error('Could not download Serverless')
      this.removeBinary()
    })

    process.on('SIGTERM', () => {
      error('Could not download Serverless')
      this.removeBinary()
    })

    const proxyUrl = getProxyUrl(this.url)
    const fetchOptions = proxyUrl
      ? { dispatcher: new ProxyAgent(proxyUrl) }
      : {}

    return fetch(this.url, fetchOptions)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        return res.arrayBuffer()
      })
      .then((buffer) => {
        writeFileSync(this.binaryPath, Buffer.from(buffer), { mode: 0o755 })
      })
      .then(() => {
        if (!suppressLogs) {
          console.error(`${this.name} has been installed!`)
        }
      })
      .catch((e) => {
        error(`Error fetching release: ${e.message}`)
        this.removeBinary()
      })
  }

  run() {
    const promise = !this.exists() ? this.install(true) : Promise.resolve()

    promise
      .then(() => {
        const [, , ...args] = process.argv

        const options = { cwd: process.cwd(), stdio: 'inherit' }

        // Ignore SIGINT and SIGTERM so the child process handles them
        // and exits gracefully
        process.on('SIGINT', () => {})
        process.on('SIGTERM', () => {})

        const result = spawnSync(this.binaryPath, args, options)

        if (result.error) {
          error(result.error)
        }

        process.exit(result.status)
      })
      .catch((e) => {
        error(e.message)
        process.exit(1)
      })
  }
}

const getOS = () => {
  const osType = os.type()

  if (osType === 'Darwin') {
    return 'darwin'
  } else if (osType === 'Linux') {
    return 'linux'
  }

  return 'windows'
}

const getBinaryName = () => {
  const osType = getOS()
  let architecture = os.arch()

  if (architecture !== 'arm64' && architecture !== 'x64') {
    console.error(`Architecture ${architecture} is not supported.`)
    process.exit(1)
  } else if (architecture === 'arm64' && osType === 'windows') {
    console.error(`Platform ${osType} - ${architecture} is not supported.`)
    process.exit(1)
  }

  if (architecture === 'x64') {
    architecture = 'amd64'
  }

  return `serverless-${osType}-${architecture}`
}

const getBinary = () => {
  const binaryName = getBinaryName()
  const url = `https://install.serverless.com/installer-builds/${binaryName}`
  const binary = new Binary(binaryName, url, '0.0.2')
  return binary
}

const install = async () => {
  const binary = getBinary()
  return binary.install(true) // Suppresses logs from binary-install
}

const run = async () => {
  const binary = getBinary()
  binary.run()
}

module.exports = {
  install,
  run,
  getBinary,
}
