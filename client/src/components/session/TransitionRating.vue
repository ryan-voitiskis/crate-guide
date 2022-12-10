<template>
  <div class="rating">
    <StarIcon :class="{ lit: rating > 0 }" @click="rate(1)" />
    <StarIcon :class="{ lit: rating > 1 }" @click="rate(2)" />
    <StarIcon :class="{ lit: rating > 2 }" @click="rate(3)" />
    <StarIcon :class="{ lit: rating > 3 }" @click="rate(4)" />
    <StarIcon :class="{ lit: rating > 4 }" @click="rate(5)" />
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed } from "vue"
import { sessionStore } from "@/stores/sessionStore"
import StarIcon from "../icons/StarIcon.vue"
const session = sessionStore()

const props = defineProps<{
  index: number
}>()

function rate(rating: number) {
  session.transitionHistory[props.index].transitionRating = rating
}

const rating = computed(
  () => session.transitionHistory[props.index].transitionRating || 0
)
</script>

<style scoped lang="scss">
.rating {
  display: flex;
  width: 100%;
  height: 20px;
  align-items: center;
  justify-content: center;
  svg {
    height: 18px;
    padding: 0 10px;
    cursor: pointer;
    &.lit {
      fill: hsl(51, 100%, 42%);
      color: hsl(51, 100%, 42%);
    }
  }
}
</style>
