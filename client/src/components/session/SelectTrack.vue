<template>
  <div class="modal-header">
    <h2>Select a track to load</h2>
    <button class="close" type="button" @click="$parent!.$emit('close')">
      <XIcon />
    </button>
    <CrateSelect selectID="select_track_crate_select" label="Crate" />
  </div>
  <div class="modal-body">
    <div class="track-list">
      <div class="track-option-header">
        <div class="cover"></div>
        <SortByButton
          class="bpm"
          title="BPM"
          :active="state.sortBy === 'bpm'"
          :reversed="state.bpmRvrs"
          @activate="state.sortBy = 'bpm'"
          @reverse="state.bpmRvrs = !state.bpmRvrs"
        />
        <SortByButton
          class="key"
          title="Key"
          :active="state.sortBy === 'key'"
          :reversed="state.keyRvrs"
          @activate="state.sortBy = 'key'"
          @reverse="state.keyRvrs = !state.keyRvrs"
        />
        <SortByButton
          class="title"
          title="Title"
          :active="state.sortBy === 'title'"
          :reversed="state.titleRvrs"
          @activate="state.sortBy = 'title'"
          @reverse="state.titleRvrs = !state.titleRvrs"
        />
        <SortByButton
          class="artists"
          title="Artists"
          :active="state.sortBy === 'artists'"
          :reversed="state.artistsRvrs"
          @activate="state.sortBy = 'artists'"
          @reverse="state.artistsRvrs = !state.artistsRvrs"
        />
        <SortByButton
          class="label"
          title="Label"
          :active="state.sortBy === 'label'"
          :reversed="state.labelRvrs"
          @activate="state.sortBy = 'label'"
          @reverse="state.labelRvrs = !state.labelRvrs"
        />
        <SortByButton
          class="catno"
          title="Cat No."
          :active="state.sortBy === 'catno'"
          :reversed="state.catnoRvrs"
          @activate="state.sortBy = 'catno'"
          @reverse="state.catnoRvrs = !state.catnoRvrs"
        />
        <SortByButton
          class="year"
          title="Year"
          :active="state.sortBy === 'year'"
          :reversed="state.yearRvrs"
          @activate="state.sortBy = 'year'"
          @reverse="state.yearRvrs = !state.yearRvrs"
        />
      </div>
      <SelectTrackOption
        v-for="track in sortedTracks"
        :track="track"
        :key="track._id"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue"
import { TrackOfRecord } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import CrateSelect from "../inputs/CrateSelect.vue"
import localeContains from "@/utils/localeContains"
import SelectTrackOption from "@/components/session/SelectTrackOption.vue"
import SortByButton from "../collection/SortByButton.vue"
import XIcon from "@/components/icons/XIcon.vue"
import {
  sortStr,
  sortNumWithNull,
  sortNumWithUndefined,
  sortKey,
} from "@/utils/sortFunctions"
const tracks = trackStore()

const state = reactive({
  searchTitle: "",
  searchArtists: "",
  sortBy: "title",
  bpmRvrs: false,
  keyRvrs: false,
  titleRvrs: false,
  artistsRvrs: false,
  labelRvrs: false,
  catnoRvrs: false,
  yearRvrs: false,
})

const titleSearchedTracks = computed((): TrackOfRecord[] =>
  state.searchTitle !== ""
    ? tracks.crateTrackList.filter((i) =>
        localeContains(i.title, state.searchTitle)
      )
    : tracks.crateTrackList
)

const artistsSearchedTracks = computed((): TrackOfRecord[] =>
  state.searchArtists !== ""
    ? titleSearchedTracks.value.filter((i) =>
        localeContains(i.title, state.searchTitle)
      )
    : titleSearchedTracks.value
)

// sort records by title alphabetically
const sortedTracks = computed((): TrackOfRecord[] => {
  switch (state.sortBy) {
    case "bpm":
      return [...artistsSearchedTracks.value].sort(
        sortNumWithUndefined("bpmFinal", state.bpmRvrs)
      )
    case "key":
      return [...artistsSearchedTracks.value].sort(sortKey(state.keyRvrs))
    case "artists":
      return [...artistsSearchedTracks.value].sort(
        sortStr("artistsFinal", state.artistsRvrs)
      )
    case "label":
      return [...artistsSearchedTracks.value].sort(
        sortStr("label", state.labelRvrs)
      )
    case "catno":
      return [...artistsSearchedTracks.value].sort(
        sortStr("catno", state.catnoRvrs)
      )
    case "year":
      return [...artistsSearchedTracks.value].sort(
        sortNumWithNull("year", state.yearRvrs)
      )
    default: // default is title
      return [...artistsSearchedTracks.value].sort(
        sortStr("title", state.titleRvrs)
      )
  }
})
</script>

<style scoped lang="scss">
.track-option-header {
  display: grid;
  gap: 1rem;
  grid-template-columns: 4rem 4rem 6rem 6fr 4fr 3fr 10rem 6rem 6rem;

  .bpm {
    grid-area: 1 / 1 / 2 / 3;
    display: flex;
    justify-content: end;
  }
  .key {
    grid-area: 1 / 3 / 2 / 4;
    display: flex;
    justify-content: end;
  }
  .title {
    grid-area: 1 / 4 / 2 / 5;
    display: flex;
    justify-content: start;
  }
  .artists {
    grid-area: 1 / 5 / 2 / 6;
    display: flex;
    justify-content: start;
  }
  .label {
    grid-area: 1 / 6 / 2 / 7;
    display: flex;
    justify-content: start;
  }
  .catno {
    grid-area: 1 / 7 / 2 / 8;
    display: flex;
    justify-content: start;
  }
  .year {
    grid-area: 1 / 8 / 2 / 10;
    display: flex;
    justify-content: start;
  }
}
</style>
