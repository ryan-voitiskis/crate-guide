import "./assets/css/base.scss"
import "./assets/css/buttons.scss"
import "./assets/css/fonts.css"
import "./assets/css/form-custom-controls.scss"
import "./assets/css/forms.scss"
import "./assets/css/crate-guide.scss"
import "./assets/css/keyframes.css"
import "./assets/css/navs.scss"
import "./assets/css/radio-toggle.scss"
import "./assets/themes/base-colours.scss"
import "./assets/themes/light-theme.scss"
import "./assets/themes/dark-theme.scss"
import "./assets/themes/high-contrast-theme.scss"
import "./assets/themes/silver-deck.scss"
import "./assets/themes/black-deck.scss"
import "./registerServiceWorker"
import { createApp } from "vue"
import { createPinia } from "pinia"
import { userStore } from "@/stores/userStore"
import App from "./App.vue"
import router from "./router"
import globals from "./globals"
import { trackStore } from "./stores/trackStore"

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
else trackStore().generateTrackLists()
