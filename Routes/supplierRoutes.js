const express = require("express");
const { Supplier, Product } = require("../Models");

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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSupplierProductCountQuery(supplier) {
  const conditions = [];

  if (supplier?._id) {
    conditions.push({ supplier: supplier._id });
  }

  const companyName = String(supplier?.companyName || "").trim();
  if (companyName) {
    conditions.push({
      supplierName: { $regex: `^${escapeRegex(companyName)}$`, $options: "i" },
    });
  }

  if (conditions.length === 0) {
    return null;
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

async function attachLiveProductCounts(suppliers) {
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return suppliers;
  }

  const counts = await Promise.all(
    suppliers.map(async (supplier) => {
      const query = buildSupplierProductCountQuery(supplier);
      if (!query) {
        return 0;
      }

      return Product.countDocuments(query).exec();
    })
  );

  return suppliers.map((supplier, index) => {
    const supplierObject =
      supplier && typeof supplier.toObject === "function" ? supplier.toObject() : { ...supplier };

    return {
      ...supplierObject,
      stats: {
        ...(supplierObject.stats || {}),
        totalProducts: counts[index],
      },
    };
  });
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
    .then(async ([items, total]) => {
      const itemsWithCounts = await attachLiveProductCounts(items);
      res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items: itemsWithCounts,
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
