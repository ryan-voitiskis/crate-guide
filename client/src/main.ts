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
app.provide("API_URL", "http://localhost:5001/api/")
app.provide("appName", "Crate Guide")
app.provide("appNamePossessive", "Crate Guide's")

app.use(router)
app.use(pinia)
app.mount("#app")

// log into test automatically.
import { userStore } from "@/stores/userStore"
import { crateStore } from "@/stores/crateStore"
import { recordStore } from "@/stores/recordStore"
const user = userStore()
const crates = crateStore()
const records = recordStore()
const getState = async () => {
  await user.login("test@test.com", "password")
  crates.fetchCrates(user.authd.token)
  records.fetchRecords(user.authd.token)
}
getState()
