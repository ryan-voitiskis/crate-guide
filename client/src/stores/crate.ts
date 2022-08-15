import { defineStore } from "pinia"
import Crate from "../interfaces/Crate"

export const crateStore = defineStore("crate", {
  state: (): Crate => ({
    id: "",
    user: "",
    name: "",
  }),
  actions: {},
})
