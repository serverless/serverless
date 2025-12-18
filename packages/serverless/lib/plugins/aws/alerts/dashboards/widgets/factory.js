import apiGwLatencyNumbers from './api-gw/latency/numbers.js'
import apiGwLatencyTimeSeries from './api-gw/latency/time-series.js'
import apiGwRequestsNumbers from './api-gw/requests/numbers.js'
import apiGwRequestsTimeSeries from './api-gw/requests/time-series.js'

import lambdaDurationNumbers from './lambda/duration/numbers.js'
import lambdaDurationTimeSeries from './lambda/duration/time-series.js'
import lambdaErrorsNumbers from './lambda/errors/numbers.js'
import lambdaErrorsTimeSeries from './lambda/errors/time-series.js'
import lambdaInvocationsNumbers from './lambda/invocations/numbers.js'
import lambdaInvocationsTimeSeries from './lambda/invocations/time-series.js'
import lambdaThrottlesNumbers from './lambda/throttles/numbers.js'
import lambdaThrottlesTimeSeries from './lambda/throttles/time-series.js'
import lambdaIteratorAgeNumbers from './lambda/iterator-age/numbers.js'
import lambdaIteratorAgeTimeSeries from './lambda/iterator-age/time-series.js'

const widgets = {
  'api-gw': {
    latency: {
      numbers: apiGwLatencyNumbers,
      'time-series': apiGwLatencyTimeSeries,
    },
    requests: {
      numbers: apiGwRequestsNumbers,
      'time-series': apiGwRequestsTimeSeries,
    },
  },
  lambda: {
    duration: {
      numbers: lambdaDurationNumbers,
      'time-series': lambdaDurationTimeSeries,
    },
    errors: {
      numbers: lambdaErrorsNumbers,
      'time-series': lambdaErrorsTimeSeries,
    },
    invocations: {
      numbers: lambdaInvocationsNumbers,
      'time-series': lambdaInvocationsTimeSeries,
    },
    throttles: {
      numbers: lambdaThrottlesNumbers,
      'time-series': lambdaThrottlesTimeSeries,
    },
    iteratorage: {
      numbers: lambdaIteratorAgeNumbers,
      'time-series': lambdaIteratorAgeTimeSeries,
    },
  },
}

const getWidget = (service, metric, display) => {
  const serviceWidgets = widgets[service]
  if (!serviceWidgets) {
    throw new Error(`Invalid service ${service}`)
  }

  const serviceMetricWidgets = serviceWidgets[metric]
  if (!serviceMetricWidgets) {
    throw new Error(`Invalid metric ${metric} for service ${service}`)
  }

  const widget = serviceMetricWidgets[display]
  if (!widget) {
    throw new Error(
      `Invalid metric ${display} for service ${service} and metric ${metric}`,
    )
  }

  return widget
}

export default {
  getWidget,
}
