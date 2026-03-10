const mongoose = require("mongoose");

const invoiceSpecSchema = new mongoose.Schema(
  {
    invoiceEmail: { type: String, trim: true, lowercase: true },
    paymentTermsDays: { type: Number, min: 0, default: 30 },
    vatNumber: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    additionalNotes: { type: String, trim: true },
  },
  { _id: false }
);

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phoneNumber: { type: String, trim: true },
    webAddress: { type: String, trim: true },
    description: { type: String, trim: true },
    tier: {
      type: String,
      enum: ["basic", "premium"],
      default: "basic",
    },
    isParentEnterprise: { type: Boolean, default: false },
    parentEnterprise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },
    childCompanies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client",
      },
    ],
    productAccess: {
      mode: {
        type: String,
        enum: ["default_set", "all_products", "custom"],
        default: "default_set",
      },
      products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    },
    login: {
      enabled: { type: Boolean, default: true },
      lastLoginAt: { type: Date, default: null },
    },
    invoiceSpecs: {
      type: invoiceSpecSchema,
      default: () => ({}),
    },
    stats: {
      totalOrders: { type: Number, min: 0, default: 0 },
      totalSpendSek: { type: Number, min: 0, default: 0 },
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

module.exports = mongoose.model("Client", clientSchema);
