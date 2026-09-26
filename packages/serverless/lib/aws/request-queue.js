import pLimit from 'p-limit'

const requestLimit = pLimit(2)

export const requestQueue = {
  add: (fn) => requestLimit(fn),
}

export const MAX_RETRIES = (() => {
  const userValue = Number(process.env.SLS_AWS_REQUEST_MAX_RETRIES)
  return userValue >= 0 ? userValue : 4
})()
