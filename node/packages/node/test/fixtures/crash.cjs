const formatio = require("@formatio/node");

formatio.init();

switch (process.argv[2]) {
  case "uncaught":
    setTimeout(() => {
      throw new Error("boom outside any request");
    }, 10);
    break;
  case "rejection":
    Promise.reject(new Error("rejected outside any request"));
    break;
  case "owned-uncaught":
    process.on("uncaughtException", (err) => console.log(`app handled: ${err.message}`));
    setTimeout(() => {
      throw new Error("owned by the app");
    }, 10);
    setTimeout(() => console.log("still alive"), 200);
    break;
  case "owned-rejection":
    process.on("uncaughtException", (err, origin) => console.log(`app handled: ${err.message} (${origin})`));
    Promise.reject(new Error("rejection the app catches"));
    setTimeout(() => console.log("still alive"), 200);
    break;
  default:
    throw new Error(`unknown scenario ${process.argv[2]}`);
}
