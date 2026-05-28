import { runLocalDailyGeneration } from "./isla-storyline-engine.mjs";

runLocalDailyGeneration().catch((error) => {
  console.error(error);
  process.exit(1);
});
