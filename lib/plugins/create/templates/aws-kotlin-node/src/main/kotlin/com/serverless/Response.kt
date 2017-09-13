class Response(message: String, input: Map<String, Any>) {
  val message: String = message
    get
  val input: Map<String, Any> = input
    get

  override fun toString(): String {
    val str: dynamic = object{}
    str[message] = input;
    return str;
  }
}
