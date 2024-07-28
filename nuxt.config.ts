// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-04-03",
  devtools: { enabled: false },
  modules: [
    "@nuxt/eslint",
    "@nuxtjs/supabase",
    "@nuxtjs/tailwindcss",
    "shadcn-nuxt",
  ],
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    redirectOptions: {
      login: "/login",
      callback: "/confirm",
      include: undefined,
      exclude: [],
      cookieRedirect: false,
    },
  },
});
