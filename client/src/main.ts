import { createApp } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"
import "./registerServiceWorker"
import router from "./router"
import "./assets/css/colours.css"
import "./assets/css/keyframes.css"
import "./assets/css/fonts.css"
import "./assets/css/base.scss"
import "./assets/css/navs.scss"
import "./assets/css/forms.scss"
import "./assets/css/form-custom-controls.scss"

const pinia = createPinia()
const app = createApp(App)

// globals
const appName = "Crate Guide"
const discogsEndpointInfo = `${appName} will only use this to access these Discogs API endpoint:<br>api.discogs.com/users/username/collection/<br>api.discogs.com/users/username/collection/folders/`
app.provide("API_URL", "http://localhost:5001/api/")
app.provide("appName", appName)
app.provide("appNamePossessive", "Crate Guide's")
app.provide("discogsEndpointInfo", discogsEndpointInfo)

app.use(router)
app.use(pinia)
app.mount("#app")

// stay logged in cookie
import { userStore } from "@/stores/userStore"
const user = userStore()
const cookieValue = document.cookie
  .split("; ")
  .find((row) => row.startsWith("crate_guide_jwt="))
  ?.split("=")[1]

if (cookieValue) user.fetchUser(cookieValue)
