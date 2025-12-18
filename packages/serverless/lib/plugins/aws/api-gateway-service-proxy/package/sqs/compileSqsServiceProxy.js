const exported = {
  compileSqsServiceProxy() {
    this.compileIamRoleToSqs()
    this.compileMethodsToSqs()
  },
}

export default exported
