// Read at runtime so tsc does not copy package.json into dist and the two cannot drift.
export const VERSION: string = (require("../package.json") as { version: string }).version;
