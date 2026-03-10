const mongoose = require("mongoose");

const inboxMessageSchema = new mongoose.Schema(
  {
    recipientType: {
      type: String,
      enum: ["admin", "client", "supplier", "user"],
      required: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InboxMessage", inboxMessageSchema);
