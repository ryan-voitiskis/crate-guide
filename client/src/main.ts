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

// globals
const API_URL = "http://localhost:5000/api/"

const pinia = createPinia()
const app = createApp(App)
app.provide("API_URL", API_URL)

app.use(router)
app.use(pinia)
app.mount("#app")

// log into ryannn automatically.
import { userStore } from "@/stores/user"
import User from "@/interfaces/User"
const user = userStore()
const loggingInUser: User = {
  id: "62eb63d26b84b573564b68ba",
  name: "ryannn",
  email: "ryan@email.com",
  token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYyZWI2M2QyNmI4NGI1NzM1NjRiNjhiYSIsImlhdCI6MTY2MDU3ODgzNiwiZXhwIjoxNjYzMTcwODM2fQ.MO6aClsXJyXpO2krY0VVPelqBJT4xF9R8TAEqQE2gUY",
  settings: {
    theme: "light",
    turntableTheme: "8",
    turntablePitchRange: "silver",
  },
}
user.login(loggingInUser)
