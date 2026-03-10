const express = require("express");
const mongoose = require("mongoose");
const routes = require("./Routes");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

app.use("/api/users", routes.userRoutes);
app.use("/api/suppliers", routes.supplierRoutes);
app.use("/api/products", routes.productRoutes);
app.use("/api/clients", routes.clientRoutes);
app.use("/api/orders", routes.orderRoutes);
app.use("/api/inbox", routes.inboxMessageRoutes);
app.use("/api/categories", routes.categoryRoutes);

app.use((req, res) => {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

const port = process.env.PORT || 5555;
const mongoUri =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tryckeriett";

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
