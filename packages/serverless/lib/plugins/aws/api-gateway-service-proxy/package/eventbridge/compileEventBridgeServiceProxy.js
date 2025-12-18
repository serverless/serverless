const exported = {
  compileEventBridgeServiceProxy() {
    this.compileIamRoleToEventBridge()
    this.compileMethodsToEventBridge()
  },
}

export default exported
