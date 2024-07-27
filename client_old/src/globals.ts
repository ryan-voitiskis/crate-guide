let API_URL = `http://localhost:5000/api/` // development
API_URL = `/api/` // ! MUST BE UNCOMMENTED FOR PRODUCTION !! client# npm run build after uncommenting

export default {
  APP_NAME: `Crate Guide`,
  APP_NAME_POSSESSIVE: `Crate Guide's`,
  API_CRATES_URL: `${API_URL}crates/`,
  API_DISCOGS_SSE_URL: `${API_URL}discogs_sse/`,
  API_DISCOGS_URL: `${API_URL}discogs/`,
  API_SETS_URL: `${API_URL}sets/`,
  API_RECORDS_URL: `${API_URL}records/`,
  API_SPOTIFY_SSE_URL: `${API_URL}spotify_sse/`,
  API_SPOTIFY_URL: `${API_URL}spotify/`,
  API_TRACKS_URL: `${API_URL}tracks/`,
  API_USERS_URL: `${API_URL}users/`,
}
