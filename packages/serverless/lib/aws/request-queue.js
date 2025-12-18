import PromiseQueue from 'promise-queue'

PromiseQueue.configure(Promise)

export const requestQueue = new PromiseQueue(2, Infinity)

export const MAX_RETRIES = (() => {
  const userValue = Number(process.env.SLS_AWS_REQUEST_MAX_RETRIES)
  return userValue >= 0 ? userValue : 4
})()
