@JsName("Handler")
public fun Handler(input: dynamic = {}, context: Any, callback: (Any?, ApiGatewayResponse) -> ApiGatewayResponse): Any {
    println("Received: " + js("JSON.stringify(input)"));

    val responseBody: Response = Response("Go Serverless v1.x! Your Kotlin function executed successfully!", input);
    val responseHeaders: dynamic = object{}
    responseHeaders["X-Powered-By"] = "AWS Lambda & serverless"

    return callback(null, ApiGatewayResponse.build {
        statusCode = 201
        objectBody = responseBody
        headers    = responseHeaders
    })
}
