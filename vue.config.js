const { defineConfig } = require("@vue/cli-service")
module.exports = defineConfig({
  transpileDependencies: true,
  // web server doesnt finish loading app when dev server overlay turned off
  // devServer: {
  //   client: {
  //     overlay: {
  //       warnings: false,
  //     },
  //   },
  // },
})
