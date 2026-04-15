const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceSek: { type: Number, required: true, min: 0 },
    totalPriceSek: { type: Number, required: true, min: 0 },
    productName: { type: String, trim: true },
    productNumber: { type: String, trim: true },
    productImage: { type: String, trim: true },
    productDetails: { type: String, trim: true }
  },
  { _id: false }
);

const orderHistoryEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
    items: { type: [orderItemSchema], required: true, default: [] },
    deliveryStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    history: {
      type: [orderHistoryEventSchema],
      default: [{ event: "Order created", status: "pending" }],
    },
    totalAmountSek: { type: Number, min: 0, required: true },
    currency: { type: String, trim: true, default: "SEK" },
    placedAt: { type: Date, default: Date.now },
    expectedDeliveryDate: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    trackingNumber: { type: String, trim: true },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
