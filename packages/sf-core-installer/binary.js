const os = require('os')

const { existsSync, mkdirSync, rmSync, writeFileSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const { download } = require('./download')
const { getProxyUrl } = require('./proxy')

const error = (msg) => {
  console.error(msg)
  process.exit(1)
}

// The actual reason for a failure (DNS, TLS, connection refused) can sit in
// the `cause` chain or, for multi-address connection attempts, in an
// AggregateError's `errors`, so both have to be included for failures to be
// diagnosable from install logs.
const describeNode = (e) => {
  if (!(e instanceof Error)) return String(e)
  const message = e.message || e.name
  return e.code ? `${message} (${e.code})` : message
}

const describeError = (err) => {
  if (!(err instanceof Error)) return String(err)
  const parts = []
  // A cyclic cause chain would otherwise hang the process — worse than exiting
  const seen = new Set()
  let node = err
  while (node !== undefined && node !== null && !seen.has(node)) {
    seen.add(node)
    parts.push(describeNode(node))
    if (Array.isArray(node.errors) && node.errors.length > 0) {
      parts.push(node.errors.map(describeNode).join(', '))
    }
    node = node instanceof Error ? node.cause : undefined
  }
  return parts.join(': ')
}

// Shell convention for a process ended by a signal: 128 + signal number
const signalExitCode = (signal) => {
  const signalNumber = os.constants.signals[signal]
  return signalNumber ? 128 + signalNumber : 1
}

// spawnSync reports a signal-terminated child as `status: null`; passing
// that to process.exit() would report success.
const childExitCode = ({ status, signal }) =>
  status !== null ? status : signalExitCode(signal)

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
      throw new Error(errorMsg)
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

  // Downloads the binary. Rejects on any failure — how a failure is handled
  // (warn vs abort) is decided by the entrypoints (postInstall.js, run.js),
  // never here.
  async install(suppressLogs = false) {
    if (this.exists()) {
      if (!suppressLogs) {
        console.error(
          `${this.name} is already installed, skipping installation.`,
        )
      }
      return
    }

    // maxRetries/retryDelay cover transient EBUSY/EPERM on Windows, where
    // antivirus or indexers can briefly hold locks on the old binaries
    rmSync(this.installDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })

    mkdirSync(this.installDirectory, { recursive: true })

    if (!suppressLogs) {
      console.error(`Downloading release from ${this.url}`)
    }

    const abort = (signal) => {
      this.removeBinary()
      console.error('Serverless Framework binary download was interrupted')
      process.exit(signalExitCode(signal))
    }
    process.on('SIGINT', abort)
    process.on('SIGTERM', abort)

    try {
      const res = await download(this.url, getProxyUrl(this.url))
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      writeFileSync(this.binaryPath, res.body, { mode: 0o755 })
      if (!suppressLogs) {
        console.error(`${this.name} has been installed!`)
      }
    } catch (e) {
      this.removeBinary()
      throw e
    } finally {
      process.removeListener('SIGINT', abort)
      process.removeListener('SIGTERM', abort)
    }
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

        process.exit(childExitCode(result))
      })
      .catch((e) => {
        error(
          `Could not download the Serverless Framework binary: ${describeError(e)}`,
        )
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
    throw new Error(`Architecture ${architecture} is not supported.`)
  }
  if (architecture === 'arm64' && osType === 'windows') {
    throw new Error(`Platform ${osType} - ${architecture} is not supported.`)
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
  Binary,
  childExitCode,
  describeError,
}
