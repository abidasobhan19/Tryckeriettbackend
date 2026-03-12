const express = require("express");
const { Client } = require("../Models");

const clientRouter = express.Router();
const CLIENT_SEARCH_FIELDS = ["name", "email", "phoneNumber"];
const CLIENT_POPULATE_FIELDS = ["parentEnterprise", "childCompanies", "productAccess.products"];

function buildSearchQuery(searchFields, q) {
  if (!q || !Array.isArray(searchFields) || searchFields.length === 0) {
    return {};
  }

  return {
    $or: searchFields.map((field) => ({
      [field]: { $regex: q, $options: "i" },
    })),
  };
}

function populateQuery(query, populatePaths) {
  let populatedQuery = query;
  for (const path of populatePaths) {
    populatedQuery = populatedQuery.populate(path);
  }
  return populatedQuery;
}

clientRouter.patch("/:id/product-access", (req, res) => {
  Client.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        "productAccess.mode": req.body.mode,
        "productAccess.products": req.body.products || [],
      },
    },
    { new: true, runValidators: true }
  )
    .exec()
    .then((client) => {
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      return res.json(client);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update product access", error: error.message }));
});

clientRouter.patch("/:id/child-companies", (req, res) => {
  const childCompanies = Array.isArray(req.body.childCompanies) ? req.body.childCompanies : [];

  Client.findByIdAndUpdate(req.params.id, { $set: { childCompanies } }, { new: true, runValidators: true })
    .exec()
    .then((client) => {
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      return res.json(client);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update child companies", error: error.message }));
});

clientRouter.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const searchQuery = buildSearchQuery(CLIENT_SEARCH_FIELDS, req.query.q);
  const query = populateQuery(
    Client.find(searchQuery).sort("-createdAt").skip(skip).limit(limit),
    CLIENT_POPULATE_FIELDS
  );

  Promise.all([query.exec(), Client.countDocuments(searchQuery).exec()])
    .then(([items, total]) =>
      res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items,
      })
    )
    .catch((error) => res.status(500).json({ message: "Failed to fetch records", error: error.message }));
});

clientRouter.get("/:id", (req, res) => {
  const query = populateQuery(Client.findById(req.params.id), CLIENT_POPULATE_FIELDS);

  query
    .exec()
    .then((item) => {
      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json(item);
    })
    .catch((error) => res.status(500).json({ message: "Failed to fetch record", error: error.message }));
});

clientRouter.post("/", (req, res) => {
  Client.create(req.body)
    .then((created) => res.status(201).json(created))
    .catch((error) => res.status(400).json({ message: "Failed to create record", error: error.message }));
});

clientRouter.put("/:id", (req, res) => {
  Client.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .exec()
    .then((updated) => {
      if (!updated) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json(updated);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update record", error: error.message }));
});

clientRouter.delete("/:id", (req, res) => {
  Client.findByIdAndDelete(req.params.id)
    .exec()
    .then((deleted) => {
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json({ message: "Record deleted successfully" });
    })
    .catch((error) => res.status(500).json({ message: "Failed to delete record", error: error.message }));
});

module.exports = clientRouter;
