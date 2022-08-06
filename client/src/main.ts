import { createApp } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"
import "./registerServiceWorker"
import router from "./router"
import "./assets/css/colours.css"
import "./assets/css/keyframes.css"
import "./assets/css/fonts.scss"
import "./assets/css/base.scss"
import "./assets/css/app.scss"

const pinia = createPinia()
const app = createApp(App)

app.use(router)
app.use(pinia)
app.mount("#app")
