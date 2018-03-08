package com.serverless

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import org.apache.log4j.BasicConfigurator
import org.apache.log4j.Logger
import java.util.*

class Handler:RequestHandler<Map<String, Any>, ApiGatewayResponse> {
    override fun handleRequest(input:Map<String, Any>, context:Context):ApiGatewayResponse {
        BasicConfigurator.configure()
        LOG.info("received: " + input.keys.toString())

        val responseBody = Response("Go Serverless v1.x! Your Kotlin function executed successfully!", input)
        return ApiGatewayResponse.build {
            statusCode = 200
            objectBody = responseBody
            headers = Collections.singletonMap<String, String>("X-Powered-By", "AWS Lambda & serverless")
        }
    }
    companion object {
        private val LOG = Logger.getLogger(Handler::class.java)
    }
}