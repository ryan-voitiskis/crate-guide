import { createApp } from "vue"
import App from "./App.vue"
import "./registerServiceWorker"
import router from "./router"
import store from "./store"
import "./assets/css/colours.css"
import "./assets/css/base.scss"
import "./assets/css/app.scss"

createApp(App).use(store).use(router).mount("#app")
