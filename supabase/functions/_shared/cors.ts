import { createCorsHeaders, getSiteUrlConfig } from './siteUrl.ts'

export const corsHeaders = createCorsHeaders(getSiteUrlConfig().siteOrigin)
