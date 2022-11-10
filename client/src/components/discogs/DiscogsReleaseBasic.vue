<template>
  <div class="record" :class="{ staged: !state.staged }">
    <div class="cover"></div>
    <h3 class="title">{{ title }}</h3>
    <div class="label">
      <span class="catno">{{ catno }}</span> {{ label }}
      <span class="year">{{ year }}</span>
    </div>
    <span class="artists">{{ artists }}</span>
    <div class="controls">
      <button v-if="state.staged" @click="unstage()" class="inline-btn delete">
        <TrashIcon />Unstage
      </button>
      <button v-else @click="stage()" class="inline-btn add">
        <PlusCircleIcon />Stage
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, reactive } from "vue"
import { discogsStore } from "@/stores/discogsStore"
import TrashIcon from "@/components/icons/TrashIcon.vue"
import PlusCircleIcon from "@/components/icons/PlusCircleIcon.vue"
const discogs = discogsStore()

const props = defineProps<{
  id: number
  catno: string
  title: string
  label: string
  artists: string
  year: number
  cover: string
}>()

const state = reactive({
  staged: true,
})

const unstage = () => {
  state.staged = false
  discogs.unstagedImports.push(props.id)
}

const stage = () => {
  state.staged = true
  discogs.unstagedImports.splice(discogs.unstagedImports.indexOf(props.id), 1)
}

const coverImg = `url("${props.cover}")`
</script>

<style scoped lang="scss">
.record {
  background: var(--record-bg);
  display: grid;
  grid-template-columns: 9rem 3fr 1fr;
  grid-template-rows: 4rem 2rem 3rem;
  width: 100%;
  .cover {
    grid-area: 1 / 1 / 5 / 2;
    background-image: v-bind(coverImg);
    overflow: hidden;
    z-index: 0;
    background-repeat: no-repeat;
    background-size: contain;
  }
  h3.title {
    color: var(--darker-text);
    grid-area: 1 / 2 / 2 / 3;
    line-height: 4rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label {
    grid-area: 2 / 2 / 3 / 3;
    line-height: 2rem;
    font-size: 1.2rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    .catno {
      font-weight: 600;
    }
    .year {
      color: var(--light-text);
    }
  }
  .artists {
    grid-area: 3 / 2 / 4 / 3;
    line-height: 3rem;
    margin: 0 0 0 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    grid-area: 1 / 3 / 4 / 4;
    button {
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
      display: flex;
      font-size: 1.2rem;
    }
  }
  &.staged {
    color: var(--lighter-text);
    background: var(--record-unstaged-bg);
    h3.title,
    .label .year {
      color: var(--lighter-text);
    }
    .cover {
      overflow: hidden;
      filter: grayscale(100%) brightness(130%) opacity(50%);
    }
  }
}
</style>
