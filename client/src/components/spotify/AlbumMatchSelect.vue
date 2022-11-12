<template>
  <div class="album-match-select">
    <div class="existing-record">
      <div class="cover"></div>
      <h3 class="title">{{ record.title }}</h3>
      <div class="label">
        <span class="catno">{{ record.catno }}</span> {{ record.label }}
        <span class="year">{{ record.year }}</span>
      </div>
      <span class="artists">{{ record.artists }}</span>
    </div>
    <hr />
    <div class="inexact-matches">
      <AlbumMatchOption
        v-for="match in slicedMatches"
        v-bind="match"
        :record="recordID"
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
import { SpotifyAlbumEdit } from "@/interfaces/InexactAlbumMatch"
import AlbumMatchOption from "@/components/spotify/AlbumMatchOption.vue"
const records = recordStore()

const props = defineProps<{
  recordID: string
  matches: SpotifyAlbumEdit[]
}>()

const state = reactive({
  numberShown: 3,
})

const record = records.getById(props.recordID)

const slicedMatches = computed((): SpotifyAlbumEdit[] =>
  [...props.matches].slice(0, state.numberShown)
)

const coverImg = `url("${record.cover}")`
</script>

<style scoped lang="scss">
.album-match-select {
  border: 2px solid var(--border-colour);
  padding: 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .existing-record {
    display: grid;
    grid-template-columns: 120px 4fr;
    grid-template-rows: 40px 30px 30px 20px;
    width: 100%;
    column-gap: 10px;
    .cover {
      background-color: hsl(40, 13%, 82%);
      background-image: v-bind(coverImg);
      grid-area: 1 / 1 / 5 / 2;
      overflow: hidden;
      z-index: 0;
      background-repeat: no-repeat;
      background-size: contain;
    }
    h3.title {
      line-height: 40px;
      color: var(--darker-text);
      grid-area: 1 / 2 / 2 / 3;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .label {
      line-height: 30px;
      gap: 6px;
      grid-area: 2 / 2 / 3 / 3;
      font-size: 12px;
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
      line-height: 30px;
      grid-area: 3 / 2 / 4 / 3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .inexact-matches {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 10px;
    flex-wrap: wrap;
  }
  .show-more {
    align-self: center;
  }
}
</style>
