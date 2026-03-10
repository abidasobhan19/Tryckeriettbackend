const createCrudRouter = require("./createCrudRouter");
const { Client } = require("../Models");

const clientRouter = createCrudRouter(Client, {
  searchFields: ["name", "email", "phoneNumber"],
  populate: ["parentEnterprise", "childCompanies", "productAccess.products"],
});

clientRouter.patch("/:id/product-access", (req, res) => {
  Client.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        "productAccess.mode": req.body.mode,
        "productAccess.products": req.body.products || [],
      },
    },
    { new: true, runValidators: true }
  )
    .exec()
    .then((client) => {
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      return res.json(client);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update product access", error: error.message }));
});

clientRouter.patch("/:id/child-companies", (req, res) => {
  const childCompanies = Array.isArray(req.body.childCompanies) ? req.body.childCompanies : [];

  Client.findByIdAndUpdate(req.params.id, { $set: { childCompanies } }, { new: true, runValidators: true })
    .exec()
    .then((client) => {
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      return res.json(client);
    })
    .catch((error) => res.status(400).json({ message: "Failed to update child companies", error: error.message }));
});

module.exports = clientRouter;
