const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    fileName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    fileSize: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    productColor: { type: String, trim: true },
    variantNumber: { type: String, trim: true },
    assets: { type: [assetSchema], default: [] },
  },
  { _id: false }
);

const marginSchema = new mongoose.Schema(
  {
    product: { type: String, trim: true, required: true },
    printCost: { type: Number, min: 0, default: 0 },
    packing: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const minimumRuleSchema = new mongoose.Schema(
  {
    tier: { type: Number, required: true, min: 1, max: 5 },
    applyToOwnProduct: { type: Boolean, default: false },
    productPriceSek: { type: Number, min: 0, default: 0 },
    minimumNumber: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true, trim: true },
    productNumber: { type: String, required: true, trim: true, unique: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    supplierName: { type: String, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    category: { type: String, trim: true, required: true },
    additionalInformation: { type: String, trim: true },
    unit: { type: String, trim: true },
    minimumOrderQuantity: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true },
    assets: { type: [assetSchema], default: [] },
    productColor: { type: String, trim: true },
    shownPerCategory: { type: String, trim: true },
    variants: { type: [variantSchema], default: [] },
    packagingType: {
      type: String,
      trim: true,
      enum: ["none", "plastic_bag", "cardboard", "custom"],
      default: "none",
    },
    labelMethods: {
      embroidery: { type: String, trim: true },
      digitalPrintingFullColor: { type: String, trim: true },
      screenPrinting: { type: String, trim: true },
      transferPrinting: { type: String, trim: true },
    },
    pricing: {
      basePrice: { type: Number, min: 0, default: 0 },
      marginPercent: { type: Number, min: 0, default: 0 },
      sellingPrice: { type: Number, min: 0, default: 0 },
      currency: { type: String, trim: true, default: "SEK" },
      isAutoCalculated: { type: Boolean, default: true },
      supplierProfitPercent: { type: Number, min: 0, default: 0 },
      manualProfitPerProduct: { type: Number, min: 0, default: 0 },
    },
    marginOfOwnProducts: { type: [marginSchema], default: [] },
    seoSettings: {
      seoTitle: { type: String, trim: true },
      seoKeywords: { type: String, trim: true },
      seoDescription: { type: String, trim: true },
    },
    minimumNumberRules: {
      type: [minimumRuleSchema],
      default: [
        { tier: 1, applyToOwnProduct: false, productPriceSek: 0, minimumNumber: 1 },
        { tier: 2, applyToOwnProduct: true, productPriceSek: 10, minimumNumber: 25 },
        { tier: 3, applyToOwnProduct: true, productPriceSek: 50, minimumNumber: 50 },
        { tier: 4, applyToOwnProduct: false, productPriceSek: 100, minimumNumber: 100 },
        { tier: 5, applyToOwnProduct: false, productPriceSek: 500, minimumNumber: 250 },
      ],
    },
    testCalculation: {
      pricePerPieceSek: { type: Number, min: 0, default: 0 },
      minimumNumber: { type: Number, min: 0, default: 0 },
      resultPreview: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    uploadSource: {
      type: String,
      enum: ["manual", "supplier_upload"],
      default: "manual",
    },
    stats: {
      totalViews: { type: Number, min: 0, default: 0 },
      totalOrders: { type: Number, min: 0, default: 0 },
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

productSchema.pre("validate", function setSellingPrice(next) {
  if (!this.pricing) {
    return next();
  }

  if (this.pricing.isAutoCalculated) {
    const basePrice = Number(this.pricing.basePrice || 0);
    const marginPercent = Number(this.pricing.marginPercent || 0);
    this.pricing.sellingPrice = Number((basePrice * (1 + marginPercent / 100)).toFixed(2));
  }

  return next();
});

module.exports = mongoose.model("Product", productSchema);
