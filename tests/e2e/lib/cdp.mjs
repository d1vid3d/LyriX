// Minimal CDP client built on Node 22's global WebSocket/fetch. No runtime dependency.
const DEFAULT_WAIT_MS = 20_000
const DEFAULT_INTERVAL_MS = 50

export class CdpError extends Error {
  constructor(message, method) {
    super(message)
    this.name = 'CdpError'
    this.method = method
  }
}

export class Cdp {
  /** Events worth keeping for failure diagnosis and console-clean assertions. */
  #events = []
  #exceptions = []
  #consoleErrors = []
  #logErrors = []

  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.closed = false

    ws.addEventListener('message', (event) => this.#onMessage(event))
    ws.addEventListener('close', () => {
      this.closed = true
      for (const pending of this.pending.values()) {
        pending.reject(new CdpError('CDP connection closed', pending.method))
      }
      this.pending.clear()
    })
  }

  static async connect(wsUrl, { timeoutMs = 15_000 } = {}) {
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out opening CDP socket ${wsUrl}`))
      }, timeoutMs)
      ws.addEventListener(
        'open',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true }
      )
      ws.addEventListener(
        'error',
        (event) => {
          clearTimeout(timer)
          reject(new Error(`Could not open CDP socket: ${event.message ?? 'unknown error'}`))
        },
        { once: true }
      )
    })
    return new Cdp(ws)
  }

  #onMessage(event) {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    if (message.id) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(
          new CdpError(`${message.error.message} (${message.error.code})`, pending.method)
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }

    const method = message.method
    const params = message.params ?? {}

    if (method === 'Runtime.exceptionThrown') {
      const text =
        params.exceptionDetails?.exception?.description ??
        params.exceptionDetails?.text ??
        'unknown exception'
      this.#exceptions.push(text)
      this.#events.push(`[exception] ${text}`)
    }

    if (method === 'Runtime.consoleAPICalled') {
      const text = params.args
        .map((arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? '')
        .join(' ')
      this.#events.push(`[console.${params.type}] ${text}`)
      if (params.type === 'error') this.#consoleErrors.push(text)
    }

    if (method === 'Log.entryAdded') {
      const entry = params.entry ?? {}
      const text = `${entry.level ?? 'info'}: ${entry.text ?? ''}`
      this.#events.push(`[log.${entry.level ?? 'info'}] ${entry.text ?? ''}`)
      if (entry.level === 'error') this.#logErrors.push(text)
    }
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new CdpError('CDP connection closed', method))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      try {
        this.ws.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      throw new CdpError(`Evaluation failed: ${description}`, 'Runtime.evaluate')
    }
    return result.result.value
  }

  /** True when the target navigated away and the execution context has to settle. */
  static isTransientEvaluationError(error) {
    return /Execution context was destroyed|Cannot find context|Inspected target navigated/i.test(
      error?.message ?? ''
    )
  }

  async waitFor(
    label,
    expression,
    { timeoutMs = DEFAULT_WAIT_MS, intervalMs = DEFAULT_INTERVAL_MS } = {}
  ) {
    const deadline = Date.now() + timeoutMs
    let last
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(expression)
        if (last) return last
      } catch (error) {
        if (!Cdp.isTransientEvaluationError(error)) last = error.message
        else last = 'navigating'
      }
      await delay(intervalMs)
    }
    throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`)
  }

  async screenshot(path, { clip } = {}) {
    const fs = await import('node:fs/promises')
    const params = { format: 'png' }
    if (clip) params.clip = { ...clip, scale: 1 }
    const shot = await this.send('Page.captureScreenshot', params)
    await fs.writeFile(path, Buffer.from(shot.data, 'base64'))
  }

  get exceptions() {
    return [...this.#exceptions]
  }

  get consoleErrors() {
    return [...this.#consoleErrors]
  }

  get logErrors() {
    return [...this.#logErrors]
  }

  get events() {
    return [...this.#events]
  }

  close() {
    if (this.closed) return
    this.closed = true
    try {
      this.ws.close()
    } catch {
      // Ignore close failures.
    }
  }
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
