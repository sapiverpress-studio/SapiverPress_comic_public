import { runProgressiveDailyGeneration } from "./progressive-daily-generator.mjs";
import { refineProgressiveDailyStory } from "./refine-progressive-daily-story.mjs";

runProgressiveDailyGeneration()
  .then(() => refineProgressiveDailyStory())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
