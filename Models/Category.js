const mongoose = require("mongoose");

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, default: "" },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    productCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

categorySchema.index({ name: 1, parentId: 1 }, { unique: true });

categorySchema.pre("validate", function categoryPreValidate(next) {
  if (!this.slug && this.name) {
    this.slug = toSlug(this.name);
  }
  next();
});

module.exports = mongoose.model("Category", categorySchema);
