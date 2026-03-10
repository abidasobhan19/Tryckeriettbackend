const createCrudRouter = require("./createCrudRouter");
const { InboxMessage } = require("../Models");

const inboxMessageRouter = createCrudRouter(InboxMessage, {
  searchFields: ["subject", "body", "recipientType"],
  populate: ["order", "sentBy"],
});

inboxMessageRouter.patch("/:id/mark-read", (req, res) => {
  InboxMessage.findByIdAndUpdate(req.params.id, { $set: { isRead: true } }, { new: true, runValidators: true })
    .exec()
    .then((message) => {
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      return res.json(message);
    })
    .catch((error) => res.status(400).json({ message: "Failed to mark message as read", error: error.message }));
});

module.exports = inboxMessageRouter;
