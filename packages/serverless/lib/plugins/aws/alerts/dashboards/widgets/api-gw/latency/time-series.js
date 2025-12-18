const createWidget = (config) => {
  const apiName = `${config.stage}-${config.service}`

  const widget = {
    type: 'metric',
    x: config.coordinates.x,
    y: config.coordinates.y,
    width: config.coordinates.width,
    height: config.coordinates.height,
    properties: {
      title: config.title,
      view: 'timeSeries',
      stacked: false,
      metrics: [
        [
          'AWS/ApiGateway',
          'IntegrationLatency',
          'ApiName',
          apiName,
          { stat: 'p50', period: 900, region: config.region },
        ],
        [
          'AWS/ApiGateway',
          'Latency',
          'ApiName',
          apiName,
          { stat: 'p50', period: 900, region: config.region },
        ],
        [
          'AWS/ApiGateway',
          'IntegrationLatency',
          'ApiName',
          apiName,
          { stat: 'p90', period: 900, region: config.region },
        ],
        [
          'AWS/ApiGateway',
          'Latency',
          'ApiName',
          apiName,
          { stat: 'p90', period: 900, region: config.region },
        ],
      ],
      region: config.region,
    },
  }

  return widget
}

export default {
  createWidget,
}
