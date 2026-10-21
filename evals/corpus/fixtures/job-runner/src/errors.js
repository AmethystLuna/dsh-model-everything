export class TransientError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TransientError'
    this.transient = true
  }
}

export class PermanentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PermanentError'
    this.transient = false
  }
}

export const isTransient = (error) => error instanceof TransientError || error?.transient === true
