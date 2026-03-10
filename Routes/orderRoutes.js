const createCrudRouter = require("./createCrudRouter");
const { Order } = require("../Models");

const orderRouter = createCrudRouter(Order, {
  searchFields: ["orderNumber", "deliveryStatus", "trackingNumber"],
  populate: ["client", "items.product", "items.supplier", "history.createdBy"],
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

module.exports = orderRouter;
