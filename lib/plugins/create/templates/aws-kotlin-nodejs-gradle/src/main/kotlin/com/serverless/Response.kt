class Response(message: String, input: dynamic) {
  val message: String = message
    get
  val input: dynamic = input
    get

  override fun toString(): String {
    val stringified = js("JSON.stringify(this.input)")

    return "{\"$message\": ${stringified} }";
  }
}
