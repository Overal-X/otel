const express = require("express");

const app = express();
app.get("/users/:id", (req, res) => res.send(`user ${req.params.id}`));
const server = app.listen(0, "127.0.0.1", () => console.log(`listening ${server.address().port}`));
