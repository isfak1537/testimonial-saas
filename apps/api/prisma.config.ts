import { defineConfig } from "prisma/config";

// `prisma generate` does not need a database, so DATABASE_URL is optional here.
// Commands that connect (migrate, db) fail clearly when it is missing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});
