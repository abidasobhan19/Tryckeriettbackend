const express = require("express");
const { Order } = require("../Models");

const orderRouter = express.Router();
const ORDER_SEARCH_FIELDS = [
  "orderNumber",
  "deliveryStatus",
  "trackingNumber",
  "settings.checkout.contactPerson",
  "settings.checkout.companyName",
  "settings.checkout.email",
];
const ORDER_POPULATE_FIELDS = ["client", "items.product", "items.supplier", "history.createdBy"];
const VALID_DELIVERY_STATUSES = [
  "pending",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

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

function populateQuery(query, populatePaths) {
  let populatedQuery = query;
  for (const path of populatePaths) {
    populatedQuery = populatedQuery.populate(path);
  }
  return populatedQuery;
}

orderRouter.get("/summary", (req, res) => {
  Promise.all([
    Order.countDocuments({}).exec(),
    Order.countDocuments({ deliveryStatus: "pending" }).exec(),
    Order.countDocuments({ deliveryStatus: "delivered" }).exec(),
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenueSek: { $sum: "$totalAmountSek" },
        },
      },
    ]),
  ])
    .then(([totalOrders, pendingOrders, completedOrders, revenueRows]) =>
      res.json({
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenueSek: revenueRows[0]?.totalRevenueSek || 0,
      })
    )
    .catch((error) => res.status(500).json({ message: "Failed to fetch order summary", error: error.message }));
});

orderRouter.patch("/:id/delivery-status", (req, res) => {
  const { deliveryStatus, note, createdBy } = req.body;

  Order.findById(req.params.id)
    .exec()
    .then((order) => {
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return null;
      }

      order.deliveryStatus = deliveryStatus;
      order.history.push({
        event: `Delivery status changed to ${deliveryStatus}`,
        status: deliveryStatus,
        note: note || "",
        createdBy: createdBy || null,
        createdAt: new Date(),
      });

      if (deliveryStatus === "delivered" && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }

      return order.save();
    })
    .then((order) => {
      if (order) {
        res.json(order);
      }
    })
    .catch((error) => res.status(400).json({ message: "Failed to update delivery status", error: error.message }));
});

orderRouter.post("/:id/history", (req, res) => {
  Order.findById(req.params.id)
    .exec()
    .then((order) => {
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return null;
      }

      order.history.push({
        event: req.body.event,
        status: req.body.status || order.deliveryStatus,
        note: req.body.note || "",
        createdBy: req.body.createdBy || null,
        createdAt: new Date(),
      });

      return order.save();
    })
    .then((order) => {
      if (order) {
        res.status(201).json(order);
      }
    })
    .catch((error) => res.status(400).json({ message: "Failed to append order history", error: error.message }));
});

orderRouter.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const deliveryStatus = String(req.query.deliveryStatus || "").trim();
  const searchQuery = buildSearchQuery(ORDER_SEARCH_FIELDS, req.query.q);

  if (deliveryStatus) {
    if (!VALID_DELIVERY_STATUSES.includes(deliveryStatus)) {
      return res.status(400).json({ message: "Invalid deliveryStatus" });
    }
    searchQuery.deliveryStatus = deliveryStatus;
  }

  const query = populateQuery(Order.find(searchQuery).sort("-createdAt").skip(skip).limit(limit), ORDER_POPULATE_FIELDS);

  Promise.all([query.exec(), Order.countDocuments(searchQuery).exec()])
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

orderRouter.get("/:id", (req, res) => {
  const query = populateQuery(Order.findById(req.params.id), ORDER_POPULATE_FIELDS);

  query
    .exec()
    .then((item) => {
      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json(item);
    })
    .catch((error) => res.status(500).json({ message: "Failed to fetch record", error: error.message }));
});

orderRouter.post("/", (req, res) => {
  Order.create(req.body)
    .then((created) => res.status(201).json(created))
    .catch((error) => res.status(400).json({ message: "Failed to create record", error: error.message }));
});

orderRouter.put("/:id", (req, res) => {
  Order.findByIdAndUpdate(req.params.id, req.body, {
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

orderRouter.delete("/:id", (req, res) => {
  Order.findByIdAndDelete(req.params.id)
    .exec()
    .then((deleted) => {
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json({ message: "Record deleted successfully" });
    })
    .catch((error) => res.status(500).json({ message: "Failed to delete record", error: error.message }));
});

module.exports = orderRouter;
