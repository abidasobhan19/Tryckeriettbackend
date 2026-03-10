const mongoose = require("mongoose");

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
    applyToOwnProduct: { type: Boolean, default: false, alias: "enabled" },
    productPriceSek: { type: Number, min: 0, default: 0, alias: "ownProductPriceSek" },
    minimumNumber: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const supplierSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    uniqueId: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phoneNumber: { type: String, trim: true },
    webAddress: { type: String, trim: true, alias: "webAdress" },
    description: { type: String, trim: true },
    supplierProfitPercent: { type: Number, min: 0, default: 0 },
    marginOfOwnProducts: {
      type: [marginSchema],
      default: [
        { product: "Cliche", printCost: 0, packing: 0 },
        { product: "Set", printCost: 0, packing: 0 },
      ],
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
      pricePerPieceSek: { type: Number, min: 0, default: 45 },
      minimumNumber: { type: Number, min: 0, default: 50 },
      resultPreview: { type: String, trim: true, default: "Tier 3 applies" },
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    priority: {
      defaultPriority: { type: Number, min: 1, max: 100, default: 50 },
      newPriority: { type: Number, min: 1, max: 100, default: 50 },
      boostMultiplier: { type: Number, min: 0, default: 1 },
      scope: {
        type: String,
        enum: ["supplier", "category", "product"],
        default: "supplier",
      },
    },
    stats: {
      totalProducts: { type: Number, min: 0, default: 0 },
      totalOrders: { type: Number, min: 0, default: 0 },
      lastOrderAt: { type: Date, default: null },
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

module.exports = mongoose.model("Supplier", supplierSchema);
