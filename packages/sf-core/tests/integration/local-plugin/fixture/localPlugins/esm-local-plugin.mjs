export default class MyLocalEsmPlugin {
  constructor() {
    this.hooks = {
      initialize: () => {
        console.log('init my local esm plugin')
      },
      'before:deploy:deploy': () => {
        console.log('before deploy my local esm plugin')
      },
    }
  }
}
