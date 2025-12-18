const getMethodResponses = function (http) {
  const methodResponse = {
    Properties: {
      MethodResponses: [
        {
          ResponseParameters: {},
          ResponseModels: {},
          StatusCode: 200,
        },
        {
          ResponseParameters: {},
          ResponseModels: {},
          StatusCode: 400,
        },
        {
          ResponseParameters: {},
          ResponseModels: {},
          StatusCode: 500,
        },
      ],
    },
  }

  if (http && http.partialContent) {
    methodResponse.Properties.MethodResponses.push({
      ResponseParameters: {},
      ResponseModels: {},
      StatusCode: 206,
    })
  }

  if (http && http.cors) {
    let origin = http.cors.origin
    if (http.cors.origins && http.cors.origins.length) {
      origin = http.cors.origins.join(',')
    }

    methodResponse.Properties.MethodResponses.forEach((value, index) => {
      methodResponse.Properties.MethodResponses[index].ResponseParameters = {
        'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
      }
    })
  }

  return methodResponse
}

export default {
  getMethodResponses,
}
