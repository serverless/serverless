class ApiGatewayResponse(
        val statusCode: Int = 200,
        var body: String? = null,
        val headers: dynamic,
        val isBase64Encoded: Boolean = false
) {
    companion object {
        inline fun build(block: Builder.() -> Unit) = Builder().apply(block).build()
    }

    class Builder {
        var statusCode: Int = 200
        var rawBody: String? = null
        var headers: dynamic = object{}
        var objectBody: Response? = null
        var binaryBody: ByteArray? = null
        var base64Encoded: Boolean = false

        fun build(): ApiGatewayResponse {
            var body: String? = null

            when {
                rawBody != null -> body = rawBody as String
                objectBody != null -> body = objectBody.toString()
                binaryBody != null -> body = binaryBody.toString()
            }

            return ApiGatewayResponse(statusCode, body, headers, base64Encoded)
        }
    }
}
