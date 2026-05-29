import { runProgressiveDailyGeneration } from "./progressive-daily-generator.mjs";

runProgressiveDailyGeneration().catch((error) => {
  console.error(error);
  process.exit(1);
});
