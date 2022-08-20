import { createApp } from "vue"
import { createPinia } from "pinia"
import App from "./App.vue"
import "./registerServiceWorker"
import router from "./router"
import "./assets/css/colours.css"
import "./assets/css/keyframes.css"
import "./assets/css/fonts.css"
import "./assets/css/base.scss"

// globals
const API_URL = "http://localhost:5000/api/"

const pinia = createPinia()
const app = createApp(App)
app.provide("API_URL", API_URL)

app.use(router)
app.use(pinia)
app.mount("#app")

// // log into ryannn automatically.
// import { userStore } from "@/stores/userStore"
// import { crateStore } from "@/stores/crateStore"
// import User from "@/interfaces/User"
// const user = userStore()
// const crates = crateStore()
// const loggingInUser: User = {
//   id: "62eb63d26b84b573564b68ba",
//   name: "ryannn",
//   email: "ryan@email.com",
//   token:
//     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYyZWI2M2QyNmI4NGI1NzM1NjRiNjhiYSIsImlhdCI6MTY2MDU3ODgzNiwiZXhwIjoxNjYzMTcwODM2fQ.MO6aClsXJyXpO2krY0VVPelqBJT4xF9R8TAEqQE2gUY",
//   settings: {
//     theme: "light",
//     turntableTheme: "8",
//     turntablePitchRange: "silver",
//     selectedCrate: "62ff707f5be5118ea127e74a",
//   },
// }

// // handle state for automatically logged in ryannn
// const getState = async () => {
//   await user.login(loggingInUser)
//   crates.fetchCrates(loggingInUser.token)
// }
// getState()
