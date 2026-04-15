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

function extractObjectIdString(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nestedId = stringifyCellValue(value._id);
    return isValidObjectId(nestedId) ? nestedId : null;
  }

  const normalized = stringifyCellValue(value);
  return isValidObjectId(normalized) ? normalized : null;
}

const ALLOWED_PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);
const ALLOWED_PACKAGING_TYPES = new Set([
  "none",
  "plastic_bag",
  "cardboard",
  "custom",
]);
const BULK_UPLOAD_LIMIT = 20000;
const BULK_UPLOAD_INSERT_BATCH_SIZE = 100;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function stringifyCellValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function buildNormalizedUploadRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {};
  }

  return Object.entries(row).reduce((result, [key, value]) => {
    const normalizedKey = normalizeHeaderKey(key);
    if (normalizedKey && result[normalizedKey] === undefined) {
      result[normalizedKey] = value;
    }
    return result;
  }, {});
}

function pickUploadValue(row, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    if (row[normalizedAlias] !== undefined) {
      return row[normalizedAlias];
    }
  }

  return undefined;
}

function splitUploadList(value) {
  const normalized = stringifyCellValue(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildNormalizedStringList(values) {
  const seen = new Set();

  return (Array.isArray(values) ? values : splitUploadList(values))
    .map((item) => stringifyCellValue(item))
    .filter((item) => {
      if (!item) {
        return false;
      }

      const normalizedKey = item.toLowerCase();
      if (seen.has(normalizedKey)) {
        return false;
      }

      seen.add(normalizedKey);
      return true;
    });
}

function normalizeOptionalTextValue(value) {
  const normalized = stringifyCellValue(value);
  if (!normalized) {
    return undefined;
  }

  return normalized;
}

function normalizeDimensionsPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const dimensions = {
    height: normalizeOptionalTextValue(value.height),
    width: normalizeOptionalTextValue(value.width),
    length: normalizeOptionalTextValue(value.length),
  };

  return Object.values(dimensions).some((item) => item !== undefined)
    ? dimensions
    : undefined;
}

function parseOptionalNonNegativeNumber(value, fieldLabel, fallback = 0) {
  const normalized = stringifyCellValue(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} must be a valid non-negative number.`);
  }

  return parsed;
}

function parseOptionalNonNegativeInteger(value, fieldLabel, fallback = 0) {
  const normalized = stringifyCellValue(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} must be a valid non-negative whole number.`);
  }

  return parsed;
}

function normalizeUploadStatus(value) {
  const normalized = stringifyCellValue(value).toLowerCase();
  if (!normalized) {
    return "draft";
  }

  if (!ALLOWED_PRODUCT_STATUSES.has(normalized)) {
    throw new Error(`Status "${stringifyCellValue(value)}" is not supported.`);
  }

  return normalized;
}

function normalizePackagingType(value) {
  const normalized = stringifyCellValue(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!normalized) {
    return "none";
  }

  if (!ALLOWED_PACKAGING_TYPES.has(normalized)) {
    throw new Error(
      `Packaging type "${stringifyCellValue(value)}" is not supported.`,
    );
  }

  return normalized;
}

function normalizeUploadLabelMethod(value) {
  const normalized = normalizeHeaderKey(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "embroidery") {
    return { key: "embroidery", label: "Embroidery" };
  }

  if (
    normalized === "digitalprintingfullcolor" ||
    normalized === "digitalprintfullcolor" ||
    normalized === "digital"
  ) {
    return {
      key: "digitalPrintingFullColor",
      label: "Digital Printing Full Color",
    };
  }

  if (
    normalized === "screenprinting" ||
    normalized === "screenprint" ||
    normalized === "screen"
  ) {
    return { key: "screenPrinting", label: "Screen Printing" };
  }

  if (
    normalized === "transferprinting" ||
    normalized === "transferprint" ||
    normalized === "transfer"
  ) {
    return { key: "transferPrinting", label: "Transfer Printing" };
  }

  return null;
}

function buildUploadLabelMethods(value) {
  const labelMethods = {};

  for (const item of splitUploadList(value)) {
    const normalized = normalizeUploadLabelMethod(item);
    if (!normalized) {
      throw new Error(`Label method "${item}" is not supported.`);
    }

    labelMethods[normalized.key] = normalized.label;
  }

  return labelMethods;
}

function buildUploadAssets(value) {
  return splitUploadList(value).map((url) => ({
    url,
    fileName: url.split("/").filter(Boolean).pop() || url,
  }));
}

function normalizeVariantUploadField(value) {
  const normalized = normalizeHeaderKey(value);

  if (normalized === "color" || normalized === "productcolor") {
    return "productColor";
  }

  if (
    normalized === "variantnumber" ||
    normalized === "number" ||
    normalized === "sku" ||
    normalized === "id" ||
    normalized === "productnumber"
  ) {
    return "variantNumber";
  }

  if (
    normalized === "imageurls" ||
    normalized === "imageurl" ||
    normalized === "asseturls" ||
    normalized === "asseturl" ||
    normalized === "images" ||
    normalized === "image"
  ) {
    return "imageUrls";
  }

  return null;
}

function buildUploadVariants(row) {
  const variantsByIndex = new Map();

  const assignVariantField = (index, field, value, overwrite = false) => {
    if (value === undefined) {
      return;
    }

    const normalizedIndex = Number.isInteger(index) && index > 0 ? index : 1;
    const currentVariant = variantsByIndex.get(normalizedIndex) || {};

    if (overwrite || currentVariant[field] === undefined) {
      currentVariant[field] = value;
    }

    variantsByIndex.set(normalizedIndex, currentVariant);
  };

  Object.entries(row).forEach(([key, value]) => {
    const match = key.match(/^variant(\d+)(.+)$/);
    if (!match) {
      return;
    }

    const variantIndex = Number.parseInt(match[1], 10);
    const field = normalizeVariantUploadField(match[2]);

    if (!Number.isInteger(variantIndex) || variantIndex < 1 || !field) {
      return;
    }

    assignVariantField(variantIndex, field, value, true);
  });

  [
    { field: "productColor", aliases: ["variantColor", "variantProductColor"] },
    {
      field: "variantNumber",
      aliases: [
        "variantNumber",
        "variantSku",
        "variantId",
        "variantProductNumber",
      ],
    },
    {
      field: "imageUrls",
      aliases: [
        "variantImageUrls",
        "variantImageUrl",
        "variantAssetUrls",
        "variantAssetUrl",
        "variantImages",
        "variantImage",
      ],
    },
  ].forEach(({ field, aliases }) => {
    const value = pickUploadValue(row, aliases);
    assignVariantField(1, field, value);
  });

  return Array.from(variantsByIndex.entries())
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .reduce((items, [, variant]) => {
      const productColor =
        stringifyCellValue(variant.productColor) || undefined;
      const variantNumber =
        stringifyCellValue(variant.variantNumber) || undefined;
      const assets = buildUploadAssets(variant.imageUrls);

      if (!productColor && !variantNumber && assets.length === 0) {
        return items;
      }

      items.push({
        productColor,
        variantNumber,
        assets,
      });

      return items;
    }, []);
}

async function resolveSupplierUploadReference(value, supplierCache) {
  const supplierName = stringifyCellValue(value);
  if (!supplierName) {
    return { supplier: null, supplierName: undefined };
  }

  const cacheKey = supplierName.toLowerCase();
  if (supplierCache.has(cacheKey)) {
    return supplierCache.get(cacheKey);
  }

  const exactMatcher = new RegExp(`^${escapeRegex(supplierName)}$`, "i");
  const matchedSupplier = await Supplier.findOne({
    $or: [{ companyName: exactMatcher }, { uniqueId: exactMatcher }],
  })
    .select("_id companyName")
    .lean();

  const resolved = matchedSupplier
    ? {
        supplier: matchedSupplier._id,
        supplierName: matchedSupplier.companyName,
      }
    : {
        supplier: null,
        supplierName,
      };

  supplierCache.set(cacheKey, resolved);
  return resolved;
}

async function resolveSupplierUploadOverride(supplierId) {
  const normalizedSupplierId = stringifyCellValue(supplierId);
  if (!normalizedSupplierId) {
    return null;
  }

  if (!isValidObjectId(normalizedSupplierId)) {
    throw new Error("Selected supplier is invalid.");
  }

  const matchedSupplier = await Supplier.findById(normalizedSupplierId)
    .select("_id companyName")
    .lean();
  if (!matchedSupplier) {
    throw new Error("Selected supplier was not found.");
  }

  return {
    supplier: matchedSupplier._id,
    supplierName: matchedSupplier.companyName,
  };
}

async function normalizeProductWritePayload(rawPayload) {
  const payload =
    rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};
  const resolvedSupplier = await resolveSupplierUploadOverride(
    payload.supplier,
  );
  const resolvedCategory = await resolveCategoryUploadReference(
    payload.category,
    new Map(),
    payload.categoryId,
  );

  payload.supplier = resolvedSupplier ? resolvedSupplier.supplier : null;
  payload.supplierName = resolvedSupplier
    ? resolvedSupplier.supplierName
    : stringifyCellValue(payload.supplierName) || undefined;
  payload.category =
    resolvedCategory.category || stringifyCellValue(payload.category);
  payload.categoryId = resolvedCategory.categoryId;
  payload.additionalInformation =
    stringifyCellValue(payload.additionalInformation) || undefined;
  payload.otherInformation =
    stringifyCellValue(payload.otherInformation) || undefined;
  payload.countryOfOrigin =
    stringifyCellValue(payload.countryOfOrigin) || undefined;
  payload.weight = parseOptionalNonNegativeNumber(
    payload.weight,
    "Weight",
    undefined,
  );
  payload.materials = buildNormalizedStringList(payload.materials);
  payload.colors = buildNormalizedStringList(payload.colors);
  payload.dimensions = normalizeDimensionsPayload(payload.dimensions);

  if (!payload.materials.length) {
    payload.materials = undefined;
  }

  if (!payload.colors.length) {
    payload.colors = undefined;
  }

  return payload;
}

async function resolveCategoryUploadReference(
  value,
  categoryCache,
  explicitCategoryId = null,
) {
  const categoryName = stringifyCellValue(value);
  const normalizedCategoryId =
    extractObjectIdString(explicitCategoryId) ||
    extractObjectIdString(categoryName);

  if (!categoryName && !normalizedCategoryId) {
    return { category: "", categoryId: null };
  }

  const cacheKey = normalizedCategoryId
    ? `id:${normalizedCategoryId}`
    : `name:${categoryName.toLowerCase()}`;
  if (categoryCache.has(cacheKey)) {
    return categoryCache.get(cacheKey);
  }

  let matchedCategory = null;

  if (normalizedCategoryId) {
    matchedCategory = await Category.findById(normalizedCategoryId)
      .select("_id name")
      .lean();
  }

  if (!matchedCategory && categoryName) {
    const exactMatcher = new RegExp(`^${escapeRegex(categoryName)}$`, "i");
    matchedCategory = await Category.findOne({ name: exactMatcher })
      .select("_id name")
      .lean();
  }

  const resolved = matchedCategory
    ? {
        category: matchedCategory.name,
        categoryId: matchedCategory._id,
      }
    : {
        category: categoryName || normalizedCategoryId || "",
        categoryId: normalizedCategoryId,
      };

  categoryCache.set(cacheKey, resolved);
  if (resolved.category) {
    categoryCache.set(`name:${resolved.category.toLowerCase()}`, resolved);
  }
  if (resolved.categoryId) {
    categoryCache.set(`id:${String(resolved.categoryId)}`, resolved);
  }
  return resolved;
}

async function normalizeProductCategoryNames(items) {
  const records = Array.isArray(items) ? items : items ? [items] : [];
  if (!records.length) {
    return items;
  }

  const categoryIds = Array.from(
    new Set(
      records
        .map(
          (item) =>
            extractObjectIdString(item.categoryId) ||
            extractObjectIdString(item.category),
        )
        .filter(Boolean),
    ),
  );

  if (!categoryIds.length) {
    return items;
  }

  const categoryDocs = await Category.find({ _id: { $in: categoryIds } })
    .select("_id name")
    .lean();
  const categoryNameMap = new Map(
    categoryDocs.map((category) => [String(category._id), category.name]),
  );

  const normalizedRecords = records.map((item) => {
    const resolvedCategoryId =
      extractObjectIdString(item.categoryId) ||
      extractObjectIdString(item.category);
    if (!resolvedCategoryId) {
      return item;
    }

    const resolvedCategoryName = categoryNameMap.get(resolvedCategoryId);
    if (!resolvedCategoryName) {
      return item;
    }

    const normalizedItem =
      item && typeof item.toObject === "function"
        ? item.toObject()
        : { ...item };

    normalizedItem.category = resolvedCategoryName;
    normalizedItem.categoryId = resolvedCategoryId;
    return normalizedItem;
  });

  return Array.isArray(items) ? normalizedRecords : normalizedRecords[0];
}

function buildUploadRowPreview(rawRow) {
  const row = buildNormalizedUploadRow(rawRow);

  return {
    productName:
      stringifyCellValue(pickUploadValue(row, ["productName", "name"])) ||
      undefined,
    productNumber:
      stringifyCellValue(
        pickUploadValue(row, ["productNumber", "productId", "sku", "id"]),
      ) || undefined,
  };
}

function buildBulkUploadErrorMessage(error) {
  if (error && error.code === 11000) {
    const duplicateValue =
      (error.keyValue && error.keyValue.productNumber) ||
      (error.keyValue && Object.values(error.keyValue)[0]) ||
      null;

    if (duplicateValue) {
      return `Product number "${duplicateValue}" already exists.`;
    }

    return "A product with the same unique value already exists.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Failed to import row.";
}

async function buildBulkUploadPayload(
  rawRow,
  seenProductNumbers,
  supplierCache,
  categoryCache,
  supplierOverride = null,
) {
  const row = buildNormalizedUploadRow(rawRow);
  const productName = stringifyCellValue(
    pickUploadValue(row, ["productName", "name"]),
  );
  const productNumber = stringifyCellValue(
    pickUploadValue(row, ["productNumber", "productId", "sku", "id"]),
  );
  const categoryInput = pickUploadValue(row, [
    "category",
    "categoryName",
    "categoryId",
  ]);
  const supplierInput = pickUploadValue(row, [
    "supplierName",
    "supplier",
    "supplierCompany",
    "companyName",
  ]);

  if (!productName) {
    throw new Error("Product name is required.");
  }

  if (!productNumber) {
    throw new Error("Product number is required.");
  }

  if (!stringifyCellValue(categoryInput)) {
    throw new Error("Category is required.");
  }

  const duplicateCheckKey = productNumber.toLowerCase();
  if (seenProductNumbers.has(duplicateCheckKey)) {
    throw new Error(
      `Product number "${productNumber}" is duplicated in the spreadsheet.`,
    );
  }
  seenProductNumbers.add(duplicateCheckKey);

  const [{ category, categoryId }, resolvedSupplier] = await Promise.all([
    resolveCategoryUploadReference(
      categoryInput,
      categoryCache,
      pickUploadValue(row, ["categoryId"]),
    ),
    supplierOverride
      ? Promise.resolve(supplierOverride)
      : resolveSupplierUploadReference(supplierInput, supplierCache),
  ]);
  const { supplier, supplierName } = resolvedSupplier;
  const dimensions = {
    height: normalizeOptionalTextValue(
      pickUploadValue(row, ["sizeHeight", "height", "productHeight"]),
    ),
    width: normalizeOptionalTextValue(
      pickUploadValue(row, ["sizeWidth", "width", "productWidth"]),
    ),
    length: normalizeOptionalTextValue(
      pickUploadValue(row, ["sizeLength", "length", "productLength"]),
    ),
  };
  const hasDimensions = Object.values(dimensions).some(
    (value) => value !== undefined,
  );
  const materials = buildNormalizedStringList(
    pickUploadValue(row, ["materials", "material"]),
  );
  const colors = splitUploadList(
    pickUploadValue(row, ["colors", "availableColors", "swatchColors"]),
  );

  const productColor =
    stringifyCellValue(pickUploadValue(row, ["productColor", "color"])) ||
    undefined;
  const additionalInformation =
    stringifyCellValue(
      pickUploadValue(row, ["additionalInformation", "additionalInfo"]),
    ) || undefined;
  const otherInformation =
    stringifyCellValue(
      pickUploadValue(row, [
        "otherInformation",
        "otherInfo",
        "secondaryInformation",
      ]),
    ) || undefined;
  const countryOfOrigin =
    stringifyCellValue(
      pickUploadValue(row, ["countryOfOrigin", "originCountry", "country"]),
    ) || undefined;
  const description =
    stringifyCellValue(pickUploadValue(row, ["description"])) || undefined;
  const unit = stringifyCellValue(pickUploadValue(row, ["unit"])) || "pcs";
  const weight = parseOptionalNonNegativeNumber(
    pickUploadValue(row, ["weight", "productWeight"]),
    "Weight",
    undefined,
  );
  const minimumOrderQuantity = parseOptionalNonNegativeInteger(
    pickUploadValue(row, ["minimumOrderQuantity", "minimumQuantity", "moq"]),
    "Minimum order quantity",
    1,
  );
  const basePrice = parseOptionalNonNegativeNumber(
    pickUploadValue(row, ["basePrice", "basePriceSek", "price"]),
    "Base price",
    0,
  );
  const marginPercent = parseOptionalNonNegativeNumber(
    pickUploadValue(row, ["marginPercent", "margin", "markup"]),
    "Margin percent",
    0,
  );
  const packagingType = normalizePackagingType(
    pickUploadValue(row, ["packagingType", "packaging"]),
  );
  const status = normalizeUploadStatus(pickUploadValue(row, ["status"]));
  const labelMethods = buildUploadLabelMethods(
    pickUploadValue(row, ["labelMethods", "labelMethod", "printingMethods"]),
  );
  const assets = buildUploadAssets(
    pickUploadValue(row, [
      "imageUrls",
      "imageUrl",
      "assetUrls",
      "assetUrl",
      "images",
      "image",
    ]),
  );
  const variants = buildUploadVariants(row);

  return {
    productName,
    productNumber,
    supplier,
    supplierName,
    category,
    categoryId,
    additionalInformation,
    otherInformation,
    countryOfOrigin,
    weight,
    dimensions: hasDimensions ? dimensions : undefined,
    materials: materials.length > 0 ? materials : undefined,
    colors: colors.length > 0 ? colors : undefined,
    description,
    unit,
    minimumOrderQuantity,
    productColor,
    assets,
    variants,
    packagingType,
    labelMethods,
    pricing: {
      basePrice,
      marginPercent,
      currency: "SEK",
      isAutoCalculated: true,
    },
    status,
    uploadSource: "supplier_upload",
  };
}

function buildBulkUploadSuccessResult(rowNumber, created) {
  return {
    rowNumber,
    productId: created._id,
    productName: created.productName,
    productNumber: created.productNumber,
    status: "created",
    message: "Product created successfully.",
  };
}

function buildBulkUploadFailureResult(rowNumber, rowPreview, error) {
  return {
    rowNumber,
    productName: rowPreview.productName,
    productNumber: rowPreview.productNumber,
    status: "failed",
    message: buildBulkUploadErrorMessage(error),
  };
}

async function processBulkUploadRows(rows, supplierOverride) {
  const seenProductNumbers = new Set();
  const supplierCache = new Map();
  const categoryCache = new Map();
  const preparedRows = [];
  const results = [];

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const rowPreview = buildUploadRowPreview(rows[index]);

    try {
      const payload = await buildBulkUploadPayload(
        rows[index],
        seenProductNumbers,
        supplierCache,
        categoryCache,
        supplierOverride,
      );
      preparedRows.push({ rowNumber, rowPreview, payload });
    } catch (error) {
      results.push(buildBulkUploadFailureResult(rowNumber, rowPreview, error));
    }
  }

  for (
    let index = 0;
    index < preparedRows.length;
    index += BULK_UPLOAD_INSERT_BATCH_SIZE
  ) {
    const batch = preparedRows.slice(
      index,
      index + BULK_UPLOAD_INSERT_BATCH_SIZE,
    );

    const batchResults = await Promise.all(
      batch.map(async ({ rowNumber, rowPreview, payload }) => {
        try {
          const created = await Product.create(payload);
          return buildBulkUploadSuccessResult(rowNumber, created);
        } catch (error) {
          return buildBulkUploadFailureResult(rowNumber, rowPreview, error);
        }
      }),
    );

    results.push(...batchResults);
  }

  results.sort((left, right) => left.rowNumber - right.rowNumber);

  const createdCount = results.reduce(
    (count, result) => (result.status === "created" ? count + 1 : count),
    0,
  );
  const failedCount = results.length - createdCount;

  return {
    message:
      failedCount > 0
        ? createdCount > 0
          ? "Bulk upload completed with some errors."
          : "Bulk upload failed."
        : "Bulk upload completed successfully.",
    createdCount,
    failedCount,
    results,
  };
}

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
    .catch((error) =>
      res.status(500).json({
        message: "Failed to fetch supplier options",
        error: error.message,
      }),
    );
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
    .catch((error) =>
      res.status(500).json({
        message: "Failed to fetch category options",
        error: error.message,
      }),
    );
});

// productRouter.get("/page/:pageNumber", (req, res) => {
//   const page = normalizePage(req.params.pageNumber);
//   const limit = normalizeLimit(req.query.limit, 10);
//   const skip = (page - 1) * limit;
//   const q = String(req.query.q || "").trim();
//   const supplierId = String(req.query.supplierId || "").trim();
//   const categoryId = String(req.query.categoryId || "").trim();
//   const status = String(req.query.status || "").trim();

//   const query = buildProductSearchQuery(q);

//   if (supplierId) {
//     if (!isValidObjectId(supplierId)) {
//       return res.status(400).json({ message: "Invalid supplierId" });
//     }
//     query.supplier = supplierId;
//   }

//   if (categoryId) {
//     if (!isValidObjectId(categoryId)) {
//       return res.status(400).json({ message: "Invalid categoryId" });
//     }
//     query.categoryId = categoryId;
//   }

//   if (status) {
//     if (!ALLOWED_PRODUCT_STATUSES.has(status)) {
//       return res.status(400).json({ message: "Invalid status filter" });
//     }
//     query.status = status;
//   }

//   return Promise.all([
//     Product.find(query).populate("supplier").sort("-updatedAt").skip(skip).limit(limit).lean(),
//     Product.countDocuments(query).exec(),
//   ])
//     .then(async ([items, total]) => {
//       const normalizedItems = await normalizeProductCategoryNames(items);
//       return res.json({
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//         items: normalizedItems,
//       });
//     })
//     .catch((error) => res.status(500).json({ message: "Failed to fetch products", error: error.message }));
// });

productRouter.get("/page/:pageNumber", async (req, res) => {
  try {
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

      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { categoryId: categoryId }, // for newer records
          { category: categoryId }, // for your current records
        ],
      });
    }

    if (status) {
      if (!ALLOWED_PRODUCT_STATUSES.has(status)) {
        return res.status(400).json({ message: "Invalid status filter" });
      }
      query.status = status;
    }

    const [items, total] = await Promise.all([
      Product.find(query)
        .populate("supplier")
        .sort("-updatedAt")
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query).exec(),
    ]);

    const normalizedItems = await normalizeProductCategoryNames(items);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items: normalizedItems,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch products",
      error: error.message,
    });
  }
});

productRouter.patch("/:id/pricing", (req, res) => {
  Product.findByIdAndUpdate(
    req.params.id,
    { $set: { pricing: req.body } },
    { new: true, runValidators: true },
  )
    .exec()
    .then((product) => {
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      return res.json(product);
    })
    .catch((error) =>
      res.status(400).json({
        message: "Failed to update product pricing",
        error: error.message,
      }),
    );
});

productRouter.patch("/:id/minimum-number-rules", (req, res) => {
  Product.findByIdAndUpdate(
    req.params.id,
    { $set: { minimumNumberRules: req.body.minimumNumberRules || [] } },
    { new: true, runValidators: true },
  )
    .exec()
    .then((product) => {
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      return res.json(product);
    })
    .catch((error) =>
      res.status(400).json({
        message: "Failed to update minimum number rules",
        error: error.message,
      }),
    );
});

productRouter.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "20", 10), 1),
    100,
  );
  const skip = (page - 1) * limit;
  const searchQuery = buildProductSearchQuery(req.query.q);

  Promise.all([
    Product.find(searchQuery)
      .sort("-createdAt")
      .skip(skip)
      .limit(limit)
      .populate("supplier")
      .exec(),
    Product.countDocuments(searchQuery).exec(),
  ])
    .then(async ([items, total]) => {
      const normalizedItems = await normalizeProductCategoryNames(items);
      return res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        items: normalizedItems,
      });
    })
    .catch((error) =>
      res
        .status(500)
        .json({ message: "Failed to fetch records", error: error.message }),
    );
});

productRouter.get("/:id", (req, res) => {
  Product.findById(req.params.id)
    .populate("supplier")
    .exec()
    .then(async (item) => {
      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }
      const normalizedItem = await normalizeProductCategoryNames(item);
      return res.json(normalizedItem);
    })
    .catch((error) =>
      res
        .status(500)
        .json({ message: "Failed to fetch record", error: error.message }),
    );
});

productRouter.post("/", (req, res) => {
  normalizeProductWritePayload(req.body)
    .then((payload) => Product.create(payload))
    .then((created) => res.status(201).json(created))
    .catch((error) =>
      res
        .status(400)
        .json({ message: "Failed to create record", error: error.message }),
    );
});

productRouter.post("/bulk-upload", async (req, res) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  const selectedSupplierId = stringifyCellValue(
    req.body && req.body.supplierId,
  );

  if (rows.length === 0) {
    return res
      .status(400)
      .json({ message: "Upload file is empty or missing data rows." });
  }

  if (!selectedSupplierId) {
    return res
      .status(400)
      .json({ message: "Select a supplier before uploading the spreadsheet." });
  }

  if (rows.length > BULK_UPLOAD_LIMIT) {
    return res.status(400).json({
      message: `Bulk upload supports up to ${BULK_UPLOAD_LIMIT} rows at a time.`,
    });
  }

  let supplierOverride = null;

  try {
    supplierOverride = await resolveSupplierUploadOverride(selectedSupplierId);
  } catch (error) {
    return res
      .status(400)
      .json({ message: buildBulkUploadErrorMessage(error) });
  }

  try {
    const result = await processBulkUploadRows(rows, supplierOverride);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to process bulk upload.",
      error: error instanceof Error ? error.message : undefined,
    });
  }
});

productRouter.put("/:id", (req, res) => {
  normalizeProductWritePayload(req.body)
    .then((payload) =>
      Product.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      }).exec(),
    )
    .then((updated) => {
      if (!updated) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json(updated);
    })
    .catch((error) =>
      res
        .status(400)
        .json({ message: "Failed to update record", error: error.message }),
    );
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
    .catch((error) =>
      res
        .status(500)
        .json({ message: "Failed to delete record", error: error.message }),
    );
});

module.exports = productRouter;
