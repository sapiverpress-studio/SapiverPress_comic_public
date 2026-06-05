const outcome = String(process.env.COMPOSE_OUTCOME || "").trim().toLowerCase();
if (outcome === "failure" || outcome === "cancelled") {
  console.error(`Compose step outcome was ${outcome}. Rejected art should now be uploaded/committed; failing workflow intentionally.`);
  process.exit(1);
}
console.log(`Compose step outcome: ${outcome || "unknown"}.`);
