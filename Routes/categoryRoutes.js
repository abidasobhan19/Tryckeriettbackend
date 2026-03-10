const express = require("express");
const mongoose = require("mongoose");
const { Category } = require("../Models");

const categoryRouter = express.Router();

function parseParentId(parentId) {
  if (parentId === undefined) {
    return undefined;
  }

  if (parentId === null || parentId === "" || parentId === "Main" || parentId === "main") {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    throw new Error("Invalid parent category id");
  }

  return parentId;
}

function buildSearchQuery(q) {
  if (!q) {
    return {};
  }
  return {
    name: { $regex: q, $options: "i" },
  };
}

async function hasAncestor(candidateParentId, categoryId) {
  let currentId = candidateParentId;

  while (currentId) {
    if (String(currentId) === String(categoryId)) {
      return true;
    }

    const currentCategory = await Category.findById(currentId).select("parentId").lean();
    if (!currentCategory?.parentId) {
      return false;
    }

    currentId = currentCategory.parentId;
  }

  return false;
}

categoryRouter.get("/parents", (req, res) => {
  Category.find({ parentId: null })
    .select("_id name")
    .sort({ sortOrder: 1, name: 1 })
    .lean()
    .then((parents) => res.json(parents))
    .catch((error) =>
      res.status(500).json({ message: "Failed to fetch parent categories", error: error.message })
    );
});

categoryRouter.get("/tree", async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const q = String(req.query.q || "").trim();

  try {
    if (q) {
      const searchQuery = buildSearchQuery(q);
      const [items, total] = await Promise.all([
        Category.find(searchQuery).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).populate("parentId", "name").lean(),
        Category.countDocuments(searchQuery),
      ]);

      const normalizedItems = items.map((item) => ({
        ...item,
        parentName: item.parentId?.name || null,
        parentId: item.parentId?._id || null,
        children: [],
      }));

      return res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items: normalizedItems,
      });
    }

    const [parents, topLevelTotal, total] = await Promise.all([
      Category.find({ parentId: null }).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(limit).lean(),
      Category.countDocuments({ parentId: null }),
      Category.countDocuments({}),
    ]);

    const parentIds = parents.map((parent) => parent._id);
    const children = parentIds.length
      ? await Category.find({ parentId: { $in: parentIds } }).sort({ sortOrder: 1, name: 1 }).lean()
      : [];

    const childrenByParentId = new Map();
    for (const child of children) {
      const parentId = String(child.parentId);
      if (!childrenByParentId.has(parentId)) {
        childrenByParentId.set(parentId, []);
      }
      childrenByParentId.get(parentId).push({
        ...child,
        parentName: null,
        children: [],
      });
    }

    const items = parents.map((parent) => ({
      ...parent,
      parentName: null,
      children: childrenByParentId.get(String(parent._id)) || [],
    }));

    return res.json({
      page,
      limit,
      total,
      topLevelTotal,
      totalPages: Math.ceil(topLevelTotal / limit),
      items,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch categories", error: error.message });
  }
});

categoryRouter.post("/", async (req, res) => {
  const { name, isActive, productCount } = req.body;

  if (!String(name || "").trim()) {
    return res.status(400).json({ message: "Category name is required" });
  }

  let parentId = null;
  try {
    parentId = parseParentId(req.body.parentId);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  try {
    if (parentId) {
      const parentExists = await Category.exists({ _id: parentId });
      if (!parentExists) {
        return res.status(400).json({ message: "Parent category not found" });
      }
    }

    const createdCategory = await Category.create({
      name: String(name).trim(),
      parentId,
      isActive: typeof isActive === "boolean" ? isActive : true,
      productCount: Number.isFinite(Number(productCount)) ? Number(productCount) : 0,
    });

    return res.status(201).json(createdCategory);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Category with this name already exists under selected parent" });
    }
    return res.status(400).json({ message: "Failed to create category", error: error.message });
  }
});

categoryRouter.put("/:id", async (req, res) => {
  const categoryId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid category id" });
  }

  try {
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    if (typeof req.body.name === "string" && req.body.name.trim()) {
      category.name = req.body.name.trim();
    }

    const parsedParentId = parseParentId(req.body.parentId);
    if (parsedParentId !== undefined) {
      if (parsedParentId && String(parsedParentId) === String(category._id)) {
        return res.status(400).json({ message: "A category cannot be its own parent" });
      }

      if (parsedParentId) {
        const parentExists = await Category.exists({ _id: parsedParentId });
        if (!parentExists) {
          return res.status(400).json({ message: "Parent category not found" });
        }

        const createsCycle = await hasAncestor(parsedParentId, category._id);
        if (createsCycle) {
          return res.status(400).json({ message: "Invalid parent category selection" });
        }
      }

      category.parentId = parsedParentId;
    }

    if (typeof req.body.isActive === "boolean") {
      category.isActive = req.body.isActive;
    }

    if (Number.isFinite(Number(req.body.productCount))) {
      category.productCount = Math.max(Number(req.body.productCount), 0);
    }

    const updated = await category.save();
    return res.json(updated);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Category with this name already exists under selected parent" });
    }
    return res.status(400).json({ message: "Failed to update category", error: error.message });
  }
});

categoryRouter.patch("/:id/active", (req, res) => {
  const categoryId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid category id" });
  }

  if (typeof req.body.isActive !== "boolean") {
    return res.status(400).json({ message: "isActive must be boolean" });
  }

  return Category.findByIdAndUpdate(categoryId, { $set: { isActive: req.body.isActive } }, { new: true, runValidators: true })
    .lean()
    .then((updated) => {
      if (!updated) {
        return res.status(404).json({ message: "Category not found" });
      }
      return res.json(updated);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update category status", error: error.message }));
});

categoryRouter.delete("/:id", async (req, res) => {
  const categoryId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid category id" });
  }

  const rootCategory = await Category.findById(categoryId).select("_id").lean();
  if (!rootCategory) {
    return res.status(404).json({ message: "Category not found" });
  }

  const idsToDelete = [String(rootCategory._id)];
  const seen = new Set(idsToDelete);

  for (let index = 0; index < idsToDelete.length; index += 1) {
    const parentId = idsToDelete[index];
    const children = await Category.find({ parentId }).select("_id").lean();

    for (const child of children) {
      const childId = String(child._id);
      if (!seen.has(childId)) {
        seen.add(childId);
        idsToDelete.push(childId);
      }
    }
  }

  return Category.deleteMany({ _id: { $in: idsToDelete } })
    .then((result) =>
      res.json({
        message: "Category deleted successfully",
        deletedCount: result.deletedCount || 0,
      })
    )
    .catch((error) => res.status(500).json({ message: "Failed to delete category", error: error.message }));
});

module.exports = categoryRouter;
