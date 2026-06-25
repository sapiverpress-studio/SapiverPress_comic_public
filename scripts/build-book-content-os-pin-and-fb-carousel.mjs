import { execFileSync } from "child_process";

execFileSync("node", ["scripts/build-book-content-os-pin-and-fb-carousel.mjs"], { stdio: "inherit", env: { ...process.env, SKIP_BOOK_CONTENT_OS_WRAPPER: "1" } });
execFileSync("node", ["scripts/build-book-content-os-platform-adapter.mjs"], { stdio: "inherit", env: process.env });
execFileSync("node", ["scripts/apply-platform-adapter-copy.mjs", "book-content-os"], { stdio: "inherit", env: process.env });
