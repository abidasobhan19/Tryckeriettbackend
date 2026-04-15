const express = require("express");
const {
  Category,
  InboxMessage,
  Order,
  Product,
  Supplier,
  User,
} = require("../Models");

const dashboardRouter = express.Router();

const OPEN_ORDER_STATUSES = [
  "pending",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
];

dashboardRouter.get("/admin-summary", async (_req, res) => {
  try {
    const now = new Date();
    const startOfToday = getStartOfDay(now);
    const sevenDayWindowStart = addDays(startOfToday, -6);
    const thirtyDayWindowStart = addDays(startOfToday, -29);

    const [
      totalProducts,
      publishedProducts,
      draftedProducts,
      newProductsThisWeek,
      totalOrders,
      openOrders,
      deliveredOrders,
      revenueRows,
      totalMessages,
      unreadMessages,
      totalSuppliers,
      activeSuppliers,
      newSuppliersThisMonth,
      totalUsers,
      activeUsers,
      recentProductsRaw,
      recentOrdersRaw,
      recentUsersRaw,
      recentMessagesRaw,
      orderAnalyticsRows,
      categories,
    ] = await Promise.all([
      Product.countDocuments({}).exec(),
      Product.countDocuments({ status: "published" }).exec(),
      Product.countDocuments({ status: "draft" }).exec(),
      Product.countDocuments({ createdAt: { $gte: sevenDayWindowStart } }).exec(),
      Order.countDocuments({}).exec(),
      Order.countDocuments({ deliveryStatus: { $in: OPEN_ORDER_STATUSES } }).exec(),
      Order.countDocuments({ deliveryStatus: "delivered" }).exec(),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalRevenueSek: { $sum: "$totalAmountSek" },
          },
        },
      ]),
      InboxMessage.countDocuments({}).exec(),
      InboxMessage.countDocuments({ isRead: false }).exec(),
      Supplier.countDocuments({}).exec(),
      Supplier.countDocuments({ isActive: true }).exec(),
      Supplier.countDocuments({ createdAt: { $gte: thirtyDayWindowStart } }).exec(),
      User.countDocuments({}).exec(),
      User.countDocuments({ isActive: true }).exec(),
      Product.find({})
        .populate("supplier")
        .sort("-createdAt")
        .limit(8)
        .lean()
        .exec(),
      Order.find({})
        .sort("-updatedAt")
        .limit(4)
        .lean()
        .exec(),
      User.find({})
        .sort("-createdAt")
        .limit(4)
        .lean()
        .exec(),
      InboxMessage.find({})
        .sort("-createdAt")
        .limit(4)
        .lean()
        .exec(),
      Order.aggregate([
        {
          $addFields: {
            dashboardDate: { $ifNull: ["$placedAt", "$createdAt"] },
          },
        },
        {
          $match: {
            dashboardDate: { $gte: sevenDayWindowStart },
          },
        },
        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$dashboardDate",
                },
              },
            },
            completedOrders: {
              $sum: {
                $cond: [{ $eq: ["$deliveryStatus", "delivered"] }, 1, 0],
              },
            },
            openOrders: {
              $sum: {
                $cond: [
                  { $in: ["$deliveryStatus", OPEN_ORDER_STATUSES] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { "_id.day": 1 } },
      ]),
      Category.find({}).select("_id name").lean().exec(),
    ]);

    const categoryNameById = new Map(
      categories.map((category) => [String(category._id), category.name || ""]),
    );

    const recentProducts = recentProductsRaw.map((product) => ({
      _id: String(product._id),
      productName: product.productName || "Untitled product",
      category: resolveCategoryLabel(product, categoryNameById),
      productNumber: product.productNumber || "",
      supplierName:
        (product.supplier &&
          typeof product.supplier === "object" &&
          product.supplier.companyName) ||
        product.supplierName ||
        "No supplier",
      priceSek: Number(
        product.pricing?.sellingPrice ?? product.pricing?.basePrice ?? 0,
      ),
      currency: product.pricing?.currency || "SEK",
      minimumOrderQuantity: Number(product.minimumOrderQuantity || 0),
      status: product.status || "draft",
      image:
        product.assets?.[0]?.url ||
        product.variants?.[0]?.assets?.[0]?.url ||
        "",
      createdAt: toIsoString(product.createdAt),
      updatedAt: toIsoString(product.updatedAt),
    }));

    const orderAnalyticsByDay = new Map(
      orderAnalyticsRows.map((row) => [
        row._id?.day,
        {
          completedOrders: Number(row.completedOrders || 0),
          openOrders: Number(row.openOrders || 0),
        },
      ]),
    );

    const orderAnalyticsPoints = [];
    for (let index = 0; index < 7; index += 1) {
      const pointDate = addDays(sevenDayWindowStart, index);
      const dateKey = formatDateKey(pointDate);
      const row = orderAnalyticsByDay.get(dateKey) || {
        completedOrders: 0,
        openOrders: 0,
      };

      orderAnalyticsPoints.push({
        date: dateKey,
        day: pointDate.toLocaleDateString("en-GB", { weekday: "short" }),
        completedOrders: row.completedOrders,
        openOrders: row.openOrders,
      });
    }

    const maxAnalyticsValue = orderAnalyticsPoints.reduce((maxValue, point) => {
      return Math.max(maxValue, point.completedOrders, point.openOrders);
    }, 0);

    const activity = [
      ...recentOrdersRaw.map((order) => mapOrderActivity(order)),
      ...recentProductsRaw.map((product) => mapProductActivity(product)),
      ...recentUsersRaw.map((user) => mapUserActivity(user)),
      ...recentMessagesRaw.map((message) => mapMessageActivity(message)),
    ]
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 6);

    return res.json({
      generatedAt: now.toISOString(),
      summary: {
        products: {
          total: totalProducts,
          published: publishedProducts,
          draft: draftedProducts,
          newThisWeek: newProductsThisWeek,
        },
        orders: {
          total: totalOrders,
          open: openOrders,
          delivered: deliveredOrders,
          revenueSek: Number(revenueRows[0]?.totalRevenueSek || 0),
        },
        messages: {
          total: totalMessages,
          unread: unreadMessages,
          read: Math.max(totalMessages - unreadMessages, 0),
        },
        suppliers: {
          total: totalSuppliers,
          active: activeSuppliers,
          newThisMonth: newSuppliersThisMonth,
        },
        users: {
          total: totalUsers,
          active: activeUsers,
        },
      },
      orderAnalytics: {
        maxValue: maxAnalyticsValue,
        points: orderAnalyticsPoints,
      },
      activity,
      recentProducts,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch admin dashboard summary",
      error: error.message,
    });
  }
});

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getStartOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoString(value) {
  if (!value) {
    return new Date(0).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toISOString()
    : parsed.toISOString();
}

function formatOrderStatusLabel(status) {
  return String(status || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAccountTypeLabel(accountType) {
  return String(accountType || "user")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function deriveUserDisplayName(user) {
  const fullName = String(user?.fullName || "").trim();
  if (fullName) {
    return fullName;
  }

  const emailPrefix = String(user?.email || "User").split("@")[0];
  return emailPrefix
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isLikelyObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || "").trim());
}

function resolveCategoryLabel(product, categoryNameById) {
  const rawCategory = String(product?.category || "").trim();
  if (rawCategory && !isLikelyObjectId(rawCategory)) {
    return rawCategory;
  }

  const rawCategoryId = product?.categoryId || rawCategory;
  const normalizedCategoryId = String(rawCategoryId || "").trim();
  return categoryNameById.get(normalizedCategoryId) || "Uncategorized";
}

function truncate(value, maxLength = 64) {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }
  return `${normalizedValue.slice(0, Math.max(maxLength - 1, 1)).trimEnd()}…`;
}

function mapOrderActivity(order) {
  if (!order?._id) {
    return null;
  }

  const deliveryStatus = String(order.deliveryStatus || "pending");
  return {
    id: `order-${order._id}`,
    icon:
      deliveryStatus === "cancelled"
        ? "warning"
        : deliveryStatus === "delivered"
          ? "check"
          : "circle",
    text: `Order ${order.orderNumber || `#${String(order._id).slice(-6)}`} is ${formatOrderStatusLabel(
      deliveryStatus,
    )}`,
    createdAt: toIsoString(order.updatedAt || order.createdAt),
    href: `/admin/orders/view?orderId=${encodeURIComponent(String(order._id))}`,
  };
}

function mapProductActivity(product) {
  if (!product?._id) {
    return null;
  }

  const createdAt = new Date(product.createdAt || 0);
  const updatedAt = new Date(product.updatedAt || product.createdAt || 0);
  const action =
    updatedAt.getTime() - createdAt.getTime() > 60 * 1000 ? "updated" : "added";

  return {
    id: `product-${product._id}`,
    icon: "check",
    text: `Product "${truncate(product.productName || "Untitled product", 42)}" was ${action}`,
    createdAt: toIsoString(updatedAt),
    href: `/add-product?editId=${encodeURIComponent(String(product._id))}`,
  };
}

function mapUserActivity(user) {
  if (!user?._id) {
    return null;
  }

  return {
    id: `user-${user._id}`,
    icon: "user",
    text: `${deriveUserDisplayName(user)} joined as ${formatAccountTypeLabel(
      user.accountType,
    )}`,
    createdAt: toIsoString(user.createdAt),
    href: "/admin/users",
  };
}

function mapMessageActivity(message) {
  if (!message?._id) {
    return null;
  }

  return {
    id: `message-${message._id}`,
    icon: message.isRead ? "circle" : "warning",
    text: `Inbox message: ${truncate(message.subject || "Untitled message", 46)}`,
    createdAt: toIsoString(message.createdAt),
    href: "/admin",
  };
}

module.exports = dashboardRouter;
