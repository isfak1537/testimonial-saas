import { migrateDeploy } from "./migrate.js";
import { testDatabaseUrl } from "./test-db.js";

/** Runs once per integration run: bring the shared test database to the latest schema. */
export default function setup(): void {
  migrateDeploy(testDatabaseUrl());
}
