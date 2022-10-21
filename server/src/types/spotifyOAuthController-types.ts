interface AccessTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
}

function isAccessTokenResponse(obj: any): obj is AccessTokenResponse {
  return (
    typeof obj.access_token === "string" &&
    typeof obj.token_type === "string" &&
    typeof obj.expires_in === "number" &&
    typeof obj.refresh_token === "string"
  )
}

export { AccessTokenResponse, isAccessTokenResponse }
