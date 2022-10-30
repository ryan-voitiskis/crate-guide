<template>
  <div class="track-match-select">
    <div class="existing-record">
      <div class="cover" :style="backgroundImg"></div>
      <div class="title">{{ track?.title }}</div>
      <span class="artists">
        <span class="by">by </span>
        {{ track?.artists ? track.artists : record.artists }}
      </span>
      <span class="album">
        <span class="from">from </span> {{ record.title }}
      </span>
      <div class="label">
        <span class="catno">{{ record.catno }}</span> {{ record.label }}
        <span class="year">{{ record.year }}</span>
      </div>
    </div>
    <hr />
    <div class="inexact-matches">
      <TrackMatchOption
        v-for="match in slicedMatches"
        v-bind="match"
        :record="recordID"
        :track="trackID"
        :image="image"
        :key="match.id"
      />
    </div>
    <button
      v-if="state.numberShown === 3"
      class="show-more"
      @click="state.numberShown = 8"
    >
      Show more
    </button>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed, reactive } from "vue"
import { recordStore } from "@/stores/recordStore"
import { InexactTrackMatchOption } from "@/interfaces/InexactTrackMatch"
import TrackMatchOption from "@/components/spotify/TrackMatchOption.vue"
const records = recordStore()

const props = defineProps<{
  recordID: string
  trackID: string
  image: string
  options: InexactTrackMatchOption[]
}>()

const state = reactive({
  numberShown: 3,
})

const record = records.getById(props.recordID)

const track = record.tracks.find((i) => i._id === props.trackID)

const slicedMatches = computed((): InexactTrackMatchOption[] =>
  [...props.options].slice(0, state.numberShown)
)

const backgroundImg = computed(() => {
  return `background-image: url("${record.cover}");`
})
</script>

<style scoped lang="scss">
.track-match-select {
  border: 2px solid var(--border-colour);
  padding: 1rem;
  border-radius: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  .existing-record {
    display: grid;
    grid-template-columns: 12rem 4fr;
    grid-template-rows: 3rem 3rem 3rem 3rem;
    width: 100%;
    column-gap: 1rem;
    .cover {
      background-color: hsl(40, 13%, 82%);
      grid-area: 1 / 1 / 5 / 2;
      overflow: hidden;
      z-index: 0;
      background-repeat: no-repeat;
      background-size: contain;
    }
    .title {
      display: flex;
      align-items: center;
      color: var(--darker-text);
      grid-area: 1 / 2 / 2 / 3;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .artists {
      display: flex;
      align-items: center;
    }
    .label {
      display: flex;
      align-items: center;
      grid-area: 4 / 2 / 5 / 3;
      gap: 0.6rem;
      font-size: 1.2rem;
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
    .album {
      display: flex;
      align-items: center;
      grid-area: 3 / 2 / 4 / 3;
      line-height: 3rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .by,
    .from {
      color: var(--light-text);
      font-style: italic;
      margin-right: 1rem;
    }
  }

  .inexact-matches {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .show-more {
    align-self: center;
  }
}
</style>
