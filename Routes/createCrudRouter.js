const express = require("express");

function buildSearch(searchFields, q) {
  if (!q || !Array.isArray(searchFields) || searchFields.length === 0) {
    return {};
  }

  return {
    $or: searchFields.map((field) => ({
      [field]: { $regex: q, $options: "i" },
    })),
  };
}

function createCrudRouter(Model, options = {}) {
  const router = express.Router();
  const {
    populate = [],
    searchFields = [],
    defaultSort = "-createdAt",
  } = options;

  router.get("/", (req, res) => {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;
    const searchQuery = buildSearch(searchFields, req.query.q);

    let query = Model.find(searchQuery).sort(defaultSort).skip(skip).limit(limit);
    for (const path of populate) {
      query = query.populate(path);
    }

    Promise.all([query.exec(), Model.countDocuments(searchQuery).exec()])
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

  router.get("/:id", (req, res) => {
    let query = Model.findById(req.params.id);
    for (const path of populate) {
      query = query.populate(path);
    }

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

  router.post("/", (req, res) => {
    Model.create(req.body)
      .then((created) => res.status(201).json(created))
      .catch((error) => res.status(400).json({ message: "Failed to create record", error: error.message }));
  });

  router.put("/:id", (req, res) => {
    Model.findByIdAndUpdate(req.params.id, req.body, {
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

  router.delete("/:id", (req, res) => {
    Model.findByIdAndDelete(req.params.id)
      .exec()
      .then((deleted) => {
        if (!deleted) {
          return res.status(404).json({ message: "Record not found" });
        }
        return res.json({ message: "Record deleted successfully" });
      })
      .catch((error) => res.status(500).json({ message: "Failed to delete record", error: error.message }));
  });

  return router;
}

module.exports = createCrudRouter;
