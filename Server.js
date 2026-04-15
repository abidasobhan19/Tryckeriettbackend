const loadEnv = require("./loadEnv");
const express = require("express");
const mongoose = require("mongoose");

loadEnv();

const userRoutes = require("./Routes/userRoutes");
const supplierRoutes = require("./Routes/supplierRoutes");
const productRoutes = require("./Routes/productRoutes");
const clientRoutes = require("./Routes/clientRoutes");
const orderRoutes = require("./Routes/orderRoutes");
const inboxMessageRoutes = require("./Routes/inboxMessageRoutes");
const categoryRoutes = require("./Routes/categoryRoutes");
const dashboardRoutes = require("./Routes/dashboardRoutes");

const app = express();

function normalizePort(value) {
  const parsedPort = parseInt(value || "5555", 10);
  return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5555;
}

function buildMongoUri() {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }

  const host = process.env.MONGO_HOST || "127.0.0.1";
  const port = process.env.MONGO_PORT || "27017";
  const dbName = process.env.MONGO_DB_NAME || "tryckeriett";
  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const authSource = process.env.MONGO_AUTH_SOURCE;

  let credentials = "";
  if (username) {
    credentials = encodeURIComponent(username);
    if (password) {
      credentials += `:${encodeURIComponent(password)}`;
    }
    credentials += "@";
  }

  const query = authSource ? `?authSource=${encodeURIComponent(authSource)}` : "";
  return `mongodb://${credentials}${host}:${port}/${dbName}${query}`;
}

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use((req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/users", userRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/inbox", inboxMessageRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((req, res) => {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

const port = normalizePort(process.env.PORT);
const mongoUri = buildMongoUri();

function startServer() {
  mongoose
    .connect(mongoUri)
    .then(() => {
      app.listen(port, () => {
        console.log(`Server running on port ${port}`);
      });
    })
    .catch((error) => {
      console.error(
        "Failed to connect to database or start server:",
        error.message,
      );
      process.exit(1);
    });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
