const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const env = require("./config/env");
const routes = require("./routes");
const requestIdMiddleware = require("./middleware/request-id.middleware");
const notFoundMiddleware = require("./middleware/not-found.middleware");
const errorMiddleware = require("./middleware/error.middleware");
const logger = require("./utils/logger");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestIdMiddleware);

if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev", { stream: logger.httpStream }));
}

app.get("/health", (req, res) => {
  res.status(200).json({
    data: { status: "ok", timestamp: new Date().toISOString() },
  });
});

app.use(routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
