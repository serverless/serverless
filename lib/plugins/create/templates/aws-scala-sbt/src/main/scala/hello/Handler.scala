package hello

import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}
import org.apache.logging.log4j.{LogManager, Logger}

import scala.jdk.CollectionConverters._

class Handler extends RequestHandler[Request, Response] {

  val logger: Logger = LogManager.getLogger(getClass)

  def handleRequest(input: Request, context: Context): Response = {
    logger.info(s"Received a request: $input")
    Response("Go Serverless v1.0! Your function executed successfully!", input)
  }
}

class ApiGatewayHandler extends RequestHandler[Request, ApiGatewayResponse] {

  def handleRequest(input: Request, context: Context): ApiGatewayResponse = {
    val headers = Map("x-custom-response-header" -> "my custom response header value")
    ApiGatewayResponse(200, "Go Serverless v1.0! Your function executed successfully!",
      headers.asJava,
      true)
  }
}
