# Crate guide

In development: DJ app to assist in finding compatible tracks within a users physical record collection.

- Management of collection record attributes.
- Session view allows loading of 2 decks with records from collection.
- Suggestions for next track provided after a deck is loaded with a track from collection.
- Suggestions consider bpm, turntable pitch range, key and genre.

### Features implemented:

- create account and login
- create, edit and delete Records, Tracks and Crates
- connect to Discogs API using OAuth 1.0
- select from folders in Discogs collection and import records

### Features to be implemented:

- recover account and reset password
- connect to Spotify API using OAuth 2.0
- fetch BPM + other audio features from Spotify for:
  - single Track
  - whole Record
  - entire collection
- Load track onto Deck
- BPM tapper for loaded track, option to save to track
- Suggest compatible tracks for currently playing track

## Project setup

```
npm install
```

### Compiles and hot-reloads client for development

```
cd client
npm run client
```

### Compiles and hot-reloads server for development

```
cd server
npm run server
```

### Compiles and minifies for production

```
cd client
npm run build
```

### Lints and fixes files

```
cd client
npm run lint
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
