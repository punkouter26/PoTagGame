---
description: 'Tailwind CSS v3 configuration for this Vite + React project'
applyTo: 'vite.config.ts, vite.config.js, **/*.css, **/*.tsx, **/*.ts, **/*.jsx, **/*.js'
---

# Tailwind CSS v3 — Project Configuration

This project uses **Tailwind CSS v3.4** with the standard PostCSS approach.

## Current Setup

- **tailwind.config.js** — theme customisation and content paths
- **postcss.config.js** — PostCSS pipeline (tailwindcss + autoprefixer)
- **src/styles.css** — includes `@tailwind base`, `@tailwind components`, `@tailwind utilities`

## Important

Do **not** migrate to Tailwind v4 or the `@tailwindcss/vite` plugin without an explicit decision.
The v4 plugin removes the need for `postcss.config.js` and `tailwind.config.js`,
which is a breaking change from the current setup.
