const express = require("express");
const mongoose = require("mongoose");
const { Product, Supplier, Category } = require("../Models");

const productRouter = express.Router();

function buildProductSearchQuery(q) {
  if (!q) {
    return {};
  }

  return {
    $or: [
      { productName: { $regex: q, $options: "i" } },
      { productNumber: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { supplierName: { $regex: q, $options: "i" } },
    ],
  };
}

function normalizeLimit(value, fallback = 10) {
  return Math.min(Math.max(parseInt(value || String(fallback), 10), 1), 100);
}

function normalizePage(value) {
  return Math.max(parseInt(value || "1", 10), 1);
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

const ALLOWED_PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);

productRouter.get("/options/suppliers", (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = normalizeLimit(req.query.limit, 30);
  const query = q
    ? {
        $or: [
          { companyName: { $regex: q, $options: "i" } },
          { uniqueId: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  return Supplier.find(query)
    .select("_id companyName uniqueId")
    .sort({ companyName: 1 })
    .limit(limit)
    .lean()
    .then((items) => res.json({ items }))
    .catch((error) => res.status(500).json({ message: "Failed to fetch supplier options", error: error.message }));
});

productRouter.get("/options/categories", (req, res) => {
  const q = String(req.query.q || "").trim();
  const limit = normalizeLimit(req.query.limit, 50);
  const query = q ? { name: { $regex: q, $options: "i" } } : {};

  return Category.find(query)
    .select("_id name parentId")
    .sort({ name: 1 })
    .limit(limit)
    .lean()
    .then((items) => res.json({ items }))
    .catch((error) => res.status(500).json({ message: "Failed to fetch category options", error: error.message }));
});

productRouter.get("/page/:pageNumber", (req, res) => {
  const page = normalizePage(req.params.pageNumber);
  const limit = normalizeLimit(req.query.limit, 10);
  const skip = (page - 1) * limit;
  const q = String(req.query.q || "").trim();
  const supplierId = String(req.query.supplierId || "").trim();
  const categoryId = String(req.query.categoryId || "").trim();
  const status = String(req.query.status || "").trim();

  const query = buildProductSearchQuery(q);

  if (supplierId) {
    if (!isValidObjectId(supplierId)) {
      return res.status(400).json({ message: "Invalid supplierId" });
    }
    query.supplier = supplierId;
  }

  if (categoryId) {
    if (!isValidObjectId(categoryId)) {
      return res.status(400).json({ message: "Invalid categoryId" });
    }
    query.categoryId = categoryId;
  }

  if (status) {
    if (!ALLOWED_PRODUCT_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }
    query.status = status;
  }

  return Promise.all([
    Product.find(query).populate("supplier").sort("-updatedAt").skip(skip).limit(limit).lean(),
    Product.countDocuments(query).exec(),
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
    .catch((error) => res.status(500).json({ message: "Failed to fetch products", error: error.message }));
});

productRouter.patch("/:id/pricing", (req, res) => {
  Product.findByIdAndUpdate(req.params.id, { $set: { pricing: req.body } }, { new: true, runValidators: true })
    .exec()
    .then((product) => {
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      return res.json(product);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update product pricing", error: error.message }));
});

productRouter.patch("/:id/minimum-number-rules", (req, res) => {
  Product.findByIdAndUpdate(
    req.params.id,
    { $set: { minimumNumberRules: req.body.minimumNumberRules || [] } },
    { new: true, runValidators: true }
  )
    .exec()
    .then((product) => {
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      return res.json(product);
    })
    .catch((error) =>
      res.status(400).json({ message: "Failed to update minimum number rules", error: error.message })
    );
});

productRouter.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const searchQuery = buildProductSearchQuery(req.query.q);

  Promise.all([
    Product.find(searchQuery).sort("-createdAt").skip(skip).limit(limit).populate("supplier").exec(),
    Product.countDocuments(searchQuery).exec(),
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

productRouter.get("/:id", (req, res) => {
  Product.findById(req.params.id)
    .populate("supplier")
    .exec()
    .then((item) => {
      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json(item);
    })
    .catch((error) => res.status(500).json({ message: "Failed to fetch record", error: error.message }));
});

productRouter.post("/", (req, res) => {
  Product.create(req.body)
    .then((created) => res.status(201).json(created))
    .catch((error) => res.status(400).json({ message: "Failed to create record", error: error.message }));
});

productRouter.put("/:id", (req, res) => {
  Product.findByIdAndUpdate(req.params.id, req.body, {
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

productRouter.delete("/:id", (req, res) => {
  Product.findByIdAndDelete(req.params.id)
    .exec()
    .then((deleted) => {
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json({ message: "Record deleted successfully" });
    })
    .catch((error) => res.status(500).json({ message: "Failed to delete record", error: error.message }));
});

module.exports = productRouter;
