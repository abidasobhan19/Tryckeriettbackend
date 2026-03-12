const express = require("express");
const { Supplier } = require("../Models");

const supplierRouter = express.Router();
const SUPPLIER_SEARCH_FIELDS = ["companyName", "uniqueId", "email", "phoneNumber"];

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

supplierRouter.get("/page/:pageNumber", (req, res) => {
  const page = Math.max(parseInt(req.params.pageNumber || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const q = (req.query.q || "").trim();
  const searchQuery = q
    ? {
        $or: [
          { companyName: { $regex: q, $options: "i" } },
          { uniqueId: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { phoneNumber: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  return Promise.all([
    Supplier.find(searchQuery).sort("-createdAt").skip(skip).limit(limit).exec(),
    Supplier.countDocuments(searchQuery).exec(),
  ])
    .then(([items, total]) => {
      res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items,
      });
    })
    .catch((error) => res.status(500).json({ message: "Failed to fetch suppliers", error: error.message }));
});

supplierRouter.get("/by-unique-id/:uniqueId", (req, res) => {
  const uniqueId = req.params.uniqueId?.trim();
  if (!uniqueId) {
    return res.status(400).json({ message: "uniqueId is required" });
  }

  return Supplier.findOne({ uniqueId })
    .exec()
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      return res.json(supplier);
    })
    .catch((error) => res.status(500).json({ message: "Failed to fetch supplier", error: error.message }));
});

supplierRouter.put("/by-unique-id/:uniqueId", (req, res) => {
  const uniqueId = req.params.uniqueId?.trim();
  if (!uniqueId) {
    return res.status(400).json({ message: "uniqueId is required" });
  }

  return Supplier.findOneAndUpdate({ uniqueId }, req.body, {
    new: true,
    runValidators: true,
  })
    .exec()
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      return res.json(supplier);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update supplier", error: error.message }));
});

supplierRouter.delete("/by-unique-id/:uniqueId", (req, res) => {
  const uniqueId = req.params.uniqueId?.trim();
  if (!uniqueId) {
    return res.status(400).json({ message: "uniqueId is required" });
  }

  return Supplier.findOneAndDelete({ uniqueId })
    .exec()
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      return res.json({ message: "Supplier deleted successfully" });
    })
    .catch((error) => res.status(500).json({ message: "Failed to delete supplier", error: error.message }));
});

supplierRouter.patch("/:id/priority", (req, res) => {
  const { defaultPriority, newPriority, boostMultiplier, scope } = req.body;
  const setPayload = {
    "priority.defaultPriority": defaultPriority,
    "priority.newPriority": newPriority,
    "priority.boostMultiplier": boostMultiplier,
  };

  if (scope) {
    setPayload["priority.scope"] = scope;
  }

  Supplier.findByIdAndUpdate(
    req.params.id,
    { $set: setPayload },
    { new: true, runValidators: true }
  )
    .exec()
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      return res.json(supplier);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update supplier priority", error: error.message }));
});

supplierRouter.patch("/:id/profit-percent", (req, res) => {
  Supplier.findByIdAndUpdate(
    req.params.id,
    { $set: { supplierProfitPercent: req.body.supplierProfitPercent } },
    { new: true, runValidators: true }
  )
    .exec()
    .then((supplier) => {
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      return res.json(supplier);
    })
    .catch((error) =>
      res.status(400).json({ message: "Failed to update supplier profit percent", error: error.message })
    );
});

supplierRouter.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const searchQuery = buildSearchQuery(SUPPLIER_SEARCH_FIELDS, req.query.q);

  Promise.all([
    Supplier.find(searchQuery).sort("-createdAt").skip(skip).limit(limit).exec(),
    Supplier.countDocuments(searchQuery).exec(),
  ])
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

supplierRouter.get("/:id", (req, res) => {
  Supplier.findById(req.params.id)
    .exec()
    .then((item) => {
      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json(item);
    })
    .catch((error) => res.status(500).json({ message: "Failed to fetch record", error: error.message }));
});

supplierRouter.post("/", (req, res) => {
  Supplier.create(req.body)
    .then((created) => res.status(201).json(created))
    .catch((error) => res.status(400).json({ message: "Failed to create record", error: error.message }));
});

supplierRouter.put("/:id", (req, res) => {
  Supplier.findByIdAndUpdate(req.params.id, req.body, {
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

supplierRouter.delete("/:id", (req, res) => {
  Supplier.findByIdAndDelete(req.params.id)
    .exec()
    .then((deleted) => {
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json({ message: "Record deleted successfully" });
    })
    .catch((error) => res.status(500).json({ message: "Failed to delete record", error: error.message }));
});

module.exports = supplierRouter;
