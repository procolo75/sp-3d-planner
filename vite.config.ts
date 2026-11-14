import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Su GitHub Pages il sito sta in una sottocartella (https://procolo75.github.io/sp-3d-planner/):
// il workflow di pubblicazione imposta BASE_PATH; in locale resta "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
