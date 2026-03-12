const express = require("express");
const { InboxMessage } = require("../Models");

const inboxMessageRouter = express.Router();
const INBOX_MESSAGE_SEARCH_FIELDS = ["subject", "body", "recipientType"];
const INBOX_MESSAGE_POPULATE_FIELDS = ["order", "sentBy"];

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

inboxMessageRouter.get("/", (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  const searchQuery = buildSearchQuery(INBOX_MESSAGE_SEARCH_FIELDS, req.query.q);
  const query = populateQuery(
    InboxMessage.find(searchQuery).sort("-createdAt").skip(skip).limit(limit),
    INBOX_MESSAGE_POPULATE_FIELDS
  );

  Promise.all([query.exec(), InboxMessage.countDocuments(searchQuery).exec()])
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

inboxMessageRouter.get("/:id", (req, res) => {
  const query = populateQuery(InboxMessage.findById(req.params.id), INBOX_MESSAGE_POPULATE_FIELDS);

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

inboxMessageRouter.post("/", (req, res) => {
  InboxMessage.create(req.body)
    .then((created) => res.status(201).json(created))
    .catch((error) => res.status(400).json({ message: "Failed to create record", error: error.message }));
});

inboxMessageRouter.put("/:id", (req, res) => {
  InboxMessage.findByIdAndUpdate(req.params.id, req.body, {
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

inboxMessageRouter.delete("/:id", (req, res) => {
  InboxMessage.findByIdAndDelete(req.params.id)
    .exec()
    .then((deleted) => {
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      return res.json({ message: "Record deleted successfully" });
    })
    .catch((error) => res.status(500).json({ message: "Failed to delete record", error: error.message }));
});

module.exports = inboxMessageRouter;
