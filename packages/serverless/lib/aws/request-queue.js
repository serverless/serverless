import pLimit from 'p-limit'

export const requestQueue = pLimit(2)

export const MAX_RETRIES = (() => {
  const userValue = Number(process.env.SLS_AWS_REQUEST_MAX_RETRIES)
  return userValue >= 0 ? userValue : 4
})()
