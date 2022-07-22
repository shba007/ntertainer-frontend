import { defineNuxtConfig } from 'nuxt';

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
	modules: ['@nuxtjs/tailwindcss', '@vueuse/nuxt', 'nuxt-icons', '@nuxt/content'],
	runtimeConfig: {
		public: {
			apiURL: process.env.API_BASE_URL
		}
	}
});
