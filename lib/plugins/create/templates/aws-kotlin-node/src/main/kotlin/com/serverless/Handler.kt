class Handler(input: Map<String, Any>, context: Any) {
    init {
        handleRequest(input, context)
    }

    fun handleRequest(input: Map<String, Any>, context: Any): ApiGatewayResponse {
        println("Received: " + input);

        val responseBody: Response = Response("Go Serverless v1.x! Your Kotlin function executed successfully!", input);
        return ApiGatewayResponse.build {
            statusCode = 200
            objectBody = responseBody
            headers = hashMapOf("X-Powered-By" to "AWS Lambda & serverless")
        }
    }
}
