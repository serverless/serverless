package hello

import scala.beans.BeanProperty

case class ApiGatewayResponse(@BeanProperty statusCode: Integer, @BeanProperty body: String,
    @BeanProperty headers: java.util.Map[String, String], @BeanProperty base64Encoded: Boolean = false)
