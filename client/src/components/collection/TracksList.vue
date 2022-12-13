<template>
  <div class="track-option-header">
    <SortByButton
      class="bpm"
      title="BPM"
      :active="state.sortBy === 'bpm'"
      :reversed="state.bpmRvrs"
      @activate="state.sortBy = 'bpm'"
      @reverse="state.bpmRvrs = !state.bpmRvrs"
    />
    <SortByButtonIcon
      class="danceability"
      :active="state.sortBy === 'danceability'"
      :reversed="state.danceabilityRvrs"
      @activate="state.sortBy = 'danceability'"
      @reverse="state.danceabilityRvrs = !state.danceabilityRvrs"
      ><DanceIcon />
    </SortByButtonIcon>
    <SortByButtonIcon
      class="energy"
      :active="state.sortBy === 'energy'"
      :reversed="state.energyRvrs"
      @activate="state.sortBy = 'energy'"
      @reverse="state.energyRvrs = !state.energyRvrs"
      ><BoltIcon />
    </SortByButtonIcon>
    <SortByButtonIcon
      class="valence"
      :active="state.sortBy === 'valence'"
      :reversed="state.valenceRvrs"
      @activate="state.sortBy = 'valence'"
      @reverse="state.valenceRvrs = !state.valenceRvrs"
      ><SmileIcon />
    </SortByButtonIcon>
    <SortByButtonIcon
      class="duration"
      :active="state.sortBy === 'duration'"
      :reversed="state.durationRvrs"
      @activate="state.sortBy = 'duration'"
      @reverse="state.durationRvrs = !state.durationRvrs"
      ><TimerIcon />
    </SortByButtonIcon>
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
  <div class="track-list">
    <TrackSingle
      v-for="track in sortedTracks"
      :track="track"
      :key="track._id"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from "vue"
import { TrackPlus } from "@/interfaces/Track"
import { trackStore } from "@/stores/trackStore"
import localeContains from "@/utils/localeContains"
import SortByButton from "../utility/SortByButton.vue"
import {
  sortStr,
  sortNumWithNull,
  sortNumWithUndefined,
  sortNumWithUndefined2Deep,
  sortKey,
} from "@/utils/sortFunctions"
import TrackSingle from "./TrackSingle.vue"
import SortByButtonIcon from "../utility/SortByButtonIcon.vue"
import DanceIcon from "../icons/DanceIcon.vue"
import TimerIcon from "../icons/TimerIcon.vue"
import SmileIcon from "../icons/SmileIcon.vue"
import BoltIcon from "../icons/BoltIcon.vue"
const tracks = trackStore()
const yearsFilterRx = /^\d{4}\s*-\s*\d{4}$/
const yearFilterRx = /^\d{4}$/

const props = defineProps<{
  searchTitle: string
  searchArtists: string
  filterGenre: string
  filterYear: string
}>()

const state = reactive({
  sortBy: "title",
  bpmRvrs: false,
  danceabilityRvrs: false,
  energyRvrs: false,
  valenceRvrs: false,
  durationRvrs: false,
  keyRvrs: false,
  titleRvrs: false,
  artistsRvrs: false,
  labelRvrs: false,
  catnoRvrs: false,
  yearRvrs: false,
})

const titleSearchedTracks = computed((): TrackPlus[] =>
  props.searchTitle !== ""
    ? tracks.crateTrackList.filter(
        (i) =>
          localeContains(i.title, props.searchTitle) ||
          localeContains(i.catno, props.searchTitle)
      )
    : tracks.crateTrackList
)

const artistsSearchedTracks = computed((): TrackPlus[] =>
  props.searchArtists !== ""
    ? titleSearchedTracks.value.filter((i) =>
        localeContains(i.artistsFinal, props.searchArtists)
      )
    : titleSearchedTracks.value
)

const genreFilteredTracks = computed((): TrackPlus[] =>
  props.filterGenre !== ""
    ? artistsSearchedTracks.value.filter(
        (i) => i.genre && localeContains(i.genre, props.filterGenre)
      )
    : artistsSearchedTracks.value
)

const yearFilteredTracks = computed((): TrackPlus[] => {
  if (yearsFilterRx.test(props.filterYear.trim())) {
    const years = props.filterYear.matchAll(/\d{4}/g)
    const year1 = parseInt(years.next().value[0])
    const year2 = parseInt(years.next().value[0])
    if (year1 && year2)
      return genreFilteredTracks.value.filter(
        (i) => year1 <= i.year && i.year <= year2
      )
  } else if (yearFilterRx.test(props.filterYear.trim()))
    return genreFilteredTracks.value.filter(
      (i) => parseInt(props.filterYear.trim()) === i.year
    )
  return genreFilteredTracks.value
})

// sort records by title alphabetically
const sortedTracks = computed((): TrackPlus[] => {
  switch (state.sortBy) {
    case "bpm":
      return [...yearFilteredTracks.value].sort(
        sortNumWithUndefined("bpmFinal", state.bpmRvrs)
      )
    case "danceability":
      return [...yearFilteredTracks.value].sort(
        sortNumWithUndefined2Deep(
          "audioFeatures",
          "danceability",
          state.danceabilityRvrs
        )
      )
    case "energy":
      return [...yearFilteredTracks.value].sort(
        sortNumWithUndefined2Deep("audioFeatures", "energy", state.energyRvrs)
      )
    case "valence":
      return [...yearFilteredTracks.value].sort(
        sortNumWithUndefined2Deep("audioFeatures", "valence", state.valenceRvrs)
      )
    case "duration":
      return [...yearFilteredTracks.value].sort(
        sortNumWithUndefined("durationFinal", state.durationRvrs)
      )
    case "key":
      return [...yearFilteredTracks.value].sort(sortKey(state.keyRvrs))
    case "artists":
      return [...yearFilteredTracks.value].sort(
        sortStr("artistsFinal", state.artistsRvrs)
      )
    case "label":
      return [...yearFilteredTracks.value].sort(
        sortStr("label", state.labelRvrs)
      )
    case "catno":
      return [...yearFilteredTracks.value].sort(
        sortStr("catno", state.catnoRvrs)
      )
    case "year":
      return [...yearFilteredTracks.value].sort(
        sortNumWithNull("year", state.yearRvrs)
      )
    default: // default is title
      return [...yearFilteredTracks.value].sort(
        sortStr("title", state.titleRvrs)
      )
  }
})
</script>

<style scoped lang="scss">
.controls {
  display: flex;
  column-gap: 10px;
  flex-wrap: wrap;
}

.track-option-header {
  width: 100%;
  display: grid;
  column-gap: 10px;
  grid-template-columns: 40px 26px 22px 32px 44px 44px 44px 40px 60px 2fr 1fr 1fr 1fr 1fr 38px 40px;
  .bpm {
    grid-area: 1 / 1 / 2 / 5;
    display: flex;
    justify-content: end;
  }

  .danceability {
    grid-area: 1 / 5 / 2 / 6;
  }
  .energy {
    grid-area: 1 / 6 / 2 / 7;
  }
  .valence {
    grid-area: 1 / 7 / 2 / 8;
  }
  .duration {
    grid-area: 1 / 8 / 2 / 9;
  }
  .key {
    grid-area: 1 / 9 / 2 / 10;
    display: flex;
    justify-self: center;
  }
  .title {
    grid-area: 1 / 10 / 2 / 11;
    display: flex;
    justify-content: start;
  }
  .artists {
    grid-area: 1 / 11 / 2 / 12;
    display: flex;
    justify-content: start;
  }
  .genre {
    grid-area: 1 / 12 / 2 / 13;
  }
  .label {
    grid-area: 1 / 13 / 2 / 14;
    display: flex;
    justify-content: start;
  }
  .catno {
    grid-area: 1 / 14 / 2 / 15;
    display: flex;
    justify-content: start;
  }
  .year {
    grid-area: 1 / 15 / 2 / 17;
    display: flex;
    justify-content: start;
  }
}

.track-list {
  overflow: auto;
  .track:last-of-type {
    margin-bottom: 360px;
  }
}
</style>
