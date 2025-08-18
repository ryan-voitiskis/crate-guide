interface AccessTokenResponse {
  oauth_token: string
  oauth_token_secret: string
}

function isAccessTokenResponse(obj: any): obj is AccessTokenResponse {
  return (
    typeof obj.oauth_token === "string" &&
    typeof obj.oauth_token_secret === "string"
  )
}

interface IdentityResponse {
  id: number
  username: string
  resource_url: string
  consumer_name: string
}

function isIdentityResponse(obj: any): obj is IdentityResponse {
  return (
    typeof obj.id === "number" &&
    typeof obj.username === "string" &&
    typeof obj.resource_url === "string" &&
    typeof obj.consumer_name === "string"
  )
}

interface captureVerifierQuery {
  oauth_token: string
  oauth_verifier: string
}

function isCaptureVerifierQuery(obj: any): obj is captureVerifierQuery {
  return (
    typeof obj.oauth_token === "string" &&
    typeof obj.oauth_verifier === "string"
  )
}

export {
  AccessTokenResponse,
  isAccessTokenResponse,
  IdentityResponse,
  isIdentityResponse,
  captureVerifierQuery,
  isCaptureVerifierQuery,
}
