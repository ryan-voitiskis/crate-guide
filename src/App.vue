<template>
  <div class="container">
    <nav>
      <router-link class="btn" to="/">Session</router-link>
      <router-link class="btn" to="/collection">Collection</router-link>
      <router-link class="btn" to="/settings"><CogIcon /></router-link>
    </nav>
    <router-view />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue"
import CogIcon from "@/components/svg/CogIcon.vue"

export default defineComponent({
  name: "App",
  components: {
    CogIcon,
  },
})
</script>

<style lang="scss">
nav {
  padding: 30px;
  a {
    &.router-link-exact-active {
      color: #bb7e45;
      svg path {
        fill: #bb7e45;
      }
    }
  }
}
</style>
