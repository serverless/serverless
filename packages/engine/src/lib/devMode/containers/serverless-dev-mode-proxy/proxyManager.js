import { URL } from 'node:url'

/**
 * Manages proxy configurations and routing
 */
export class ProxyManager {
  #proxies = []
  #mutex = new Mutex()

  /**
   * Adds a new proxy configuration
   * @param {Object} proxy Proxy configuration
   * @param {string} proxy.service Service name
   * @param {string} proxy.url Target URL
   * @param {string} proxy.path Path pattern to match
   * @param {string} [proxy.invokeType] Type of invocation (e.g. 'awsLambda')
   */
  async addPath(proxy) {
    await this.#mutex.acquire()
    try {
      // Clean URL to remove path components
      const url = new URL(proxy.url)
      proxy.url = `${url.protocol}//${url.host}`

      this.#proxies.push(proxy)
    } finally {
      this.#mutex.release()
    }
  }

  /**
   * Adds multiple proxy configurations, sorted by path segments
   * @param {Array<Object>} proxies Array of proxy configurations
   */
  async addMultiplePaths(proxies) {
    // Sort by path segments descending (most specific first)
    const sortedProxies = [...proxies].sort((a, b) => {
      const aCount = a.path.split('/').filter(Boolean).length
      const bCount = b.path.split('/').filter(Boolean).length
      return bCount - aCount
    })

    for (const proxy of sortedProxies) {
      await this.addPath(proxy)
    }
  }

  /**
   * Removes all proxy configurations for a service
   * @param {string} service Service name to remove
   */
  async removePaths(service) {
    await this.#mutex.acquire()
    try {
      this.#proxies = this.#proxies.filter((p) => p.service !== service)
    } finally {
      this.#mutex.release()
    }
  }

  /**
   * Gets all proxy configurations
   * @returns {Array<Object>} Array of proxy configurations
   */
  getProxies() {
    return [...this.#proxies]
  }
}

/**
 * Simple mutex implementation for synchronization
 */
class Mutex {
  #locked = false
  #waitQueue = []

  async acquire() {
    if (!this.#locked) {
      this.#locked = true
      return
    }

    return new Promise((resolve) => {
      this.#waitQueue.push(resolve)
    })
  }

  release() {
    if (this.#waitQueue.length > 0) {
      const next = this.#waitQueue.shift()
      next()
    } else {
      this.#locked = false
    }
  }
}
