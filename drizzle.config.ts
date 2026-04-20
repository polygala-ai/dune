import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dbCredentials: {
    url: './.drizzle/dune.sqlite',
  },
  dialect: 'sqlite',
  out: './src/electron/main/orm/migrations',
  schema: './src/electron/main/orm/schema/index.ts',
  strict: true,
  verbose: true,
});
