import "./assets/css/base.scss"
import "./assets/css/colours.css"
import "./assets/css/fonts.css"
import "./assets/css/form-custom-controls.scss"
import "./assets/css/forms.scss"
import "./assets/css/crate-guide.scss"
import "./assets/css/keyframes.css"
import "./assets/css/navs.scss"
import "./registerServiceWorker"
import { createApp } from "vue"
import { createPinia } from "pinia"
import { userStore } from "@/stores/userStore"
import App from "./App.vue"
import router from "./router"
import globals from "./globals"

const pinia = createPinia()
const app = createApp(App)

// globals
app.provide("appName", globals.APP_NAME)
app.provide("appNamePossessive", globals.APP_NAME_POSSESSIVE)

app.use(router)
app.use(pinia)
app.mount("#app")

// stay logged in cookie. only used to fetchUser, not used as authentication
const user = userStore()
const cookieValue = document.cookie
  .split("; ")
  .find((row) => row.startsWith("crate_guide_jwt="))
  ?.split("=")[1]
if (cookieValue) user.fetchUser(cookieValue)
