// An application that depends on @formatio/otel-node itself and starts it first, as documented;
// the test installs that copy into node_modules next to it, apart from the one Formatio preloads.
const ownCopy = require("@formatio/otel-node");

ownCopy.init();

const express = require("express");

const app = express();
app.get("/users/:id", (req, res) => res.send(`user ${req.params.id}`));
app.get("/flush", async (req, res) => res.send(`flushed ${await ownCopy.flush()}`));
app.get("/crash", (req, res) => {
  res.send("crashing");
  setTimeout(() => {
    throw new Error("crash with two copies loaded");
  }, 10);
});
const server = app.listen(0, "127.0.0.1", () => console.log(`listening ${server.address().port}`));
