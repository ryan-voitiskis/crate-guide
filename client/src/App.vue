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

<script setup lang="ts">
import CogIcon from "@/components/svg/CogIcon.vue"
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
