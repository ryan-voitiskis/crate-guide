<template>
  <div class="home">
    <img alt="Vue logo" src="../assets/logo.png" />
    <DeckController msg="Welcome to Your Vue.js + TypeScript App" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import DeckController from "@/components/DeckController.vue"; // @ is an alias to /src

export default defineComponent({
  name: "HomeView",
  components: {
    DeckController,
  },
});
</script>
