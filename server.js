const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");

loadEnvFile();

let mongoose = null;
try {
  mongoose = require("mongoose");
} catch {
  mongoose = null;
}

const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || "marketlane-development-secret";
const MONGODB_URI = process.env.MONGODB_URI || "";

app.use(express.json({ limit: "1mb" }));

let store = createJsonStore();
let databaseMode = "json-file";
let UserModel = null;
let ProductModel = null;
let OrderModel = null;

const ready = initializeDatabase();

app.get("/api/health", async (_req, res) => {
  await ready;
  res.json({
    ok: true,
    app: "MarketLane Commerce",
    database: databaseMode,
  });
});

app.post("/api/auth/signup", async (req, res, next) => {
  try {
    await ready;
    const { name, email, password } = req.body;
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanName || !isEmail(cleanEmail) || String(password || "").length < 6) {
      return res.status(400).json({ message: "Enter a name, valid email, and a password with at least 6 characters." });
    }

    const existingUser = await store.findUserByEmail(cleanEmail);
    if (existingUser) {
      return res.status(409).json({ message: "An account already exists for this email." });
    }

    const user = await store.createUser({
      name: cleanName,
      email: cleanEmail,
      passwordHash: hashPassword(password),
    });

    res.status(201).json(createSession(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    await ready;
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await store.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    res.json(createSession(user));
  } catch (error) {
    next(error);
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    await ready;
    const products = await store.listProducts({
      search: String(req.query.q || "").trim(),
      category: String(req.query.category || "").trim(),
    });
    res.json({ products: products.map(toClientProduct) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    await ready;
    const product = await store.findProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.json({ product: toClientProduct(product) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders", requireAuth, async (req, res, next) => {
  try {
    await ready;
    const orders = await store.listOrders(req.userId);
    res.json({ orders: orders.map(toClientOrder) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", requireAuth, async (req, res, next) => {
  try {
    await ready;
    const order = await placeOrder(req.userId, req.body);
    res.status(201).json({ order: toClientOrder(order) });
  } catch (error) {
    next(error);
  }
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(__dirname, "styles.css")));
app.get("/script.js", (_req, res) => res.sendFile(path.join(__dirname, "script.js")));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ message: status === 500 ? "Server error. Please try again." : error.message });
});

if (require.main === module) {
  ready.then(() => {
    app.listen(PORT, () => {
      console.log(`MarketLane Commerce running at http://localhost:${PORT}`);
      console.log(`Database mode: ${databaseMode}`);
    });
  });
}

module.exports = app;

async function initializeDatabase() {
  if (!MONGODB_URI) {
    store.ensureReady();
    return;
  }

  if (!mongoose) {
    console.warn("Mongoose is not installed. Falling back to local JSON storage.");
    store.ensureReady();
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    defineMongoModels();
    store = createMongoStore();
    databaseMode = "mongodb";
    await seedMongoProducts();
  } catch (error) {
    console.warn(`MongoDB connection failed: ${error.message}`);
    console.warn("Falling back to local JSON storage for development.");
    store.ensureReady();
  }
}

function defineMongoModels() {
  const userSchema = new mongoose.Schema(
    {
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true, lowercase: true },
      passwordHash: { type: String, required: true },
    },
    { timestamps: true }
  );

  const productSchema = new mongoose.Schema(
    {
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true, index: true },
      description: { type: String, required: true },
      category: { type: String, required: true, index: true },
      image: { type: String, required: true },
      priceCents: { type: Number, required: true, min: 0 },
      stock: { type: Number, required: true, min: 0 },
      rating: { type: Number, default: 4.5 },
      tags: [{ type: String }],
      specs: [
        {
          label: String,
          value: String,
        },
      ],
    },
    { timestamps: true }
  );

  const orderSchema = new mongoose.Schema(
    {
      userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
      orderNumber: { type: String, required: true, unique: true },
      items: [
        {
          productId: { type: mongoose.Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          image: { type: String, required: true },
          priceCents: { type: Number, required: true },
          quantity: { type: Number, required: true },
          lineTotalCents: { type: Number, required: true },
        },
      ],
      customer: {
        name: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        zip: String,
      },
      paymentMethod: { type: String, default: "Card" },
      subtotalCents: { type: Number, required: true },
      taxCents: { type: Number, required: true },
      shippingCents: { type: Number, required: true },
      totalCents: { type: Number, required: true },
      status: { type: String, default: "Processing" },
    },
    { timestamps: true }
  );

  UserModel = mongoose.models.ShopUser || mongoose.model("ShopUser", userSchema);
  ProductModel = mongoose.models.ShopProduct || mongoose.model("ShopProduct", productSchema);
  OrderModel = mongoose.models.ShopOrder || mongoose.model("ShopOrder", orderSchema);
}

function createMongoStore() {
  return {
    async findUserByEmail(email) {
      return UserModel.findOne({ email });
    },
    async createUser(data) {
      return UserModel.create(data);
    },
    async listProducts(filters = {}) {
      const query = buildProductQuery(filters);
      return ProductModel.find(query).sort({ category: 1, name: 1 });
    },
    async findProductById(productId) {
      if (!mongoose.isValidObjectId(productId)) return null;
      return ProductModel.findById(productId);
    },
    async getProductsByIds(productIds) {
      const validIds = productIds.filter((id) => mongoose.isValidObjectId(id));
      if (!validIds.length) return [];
      return ProductModel.find({ _id: { $in: validIds } });
    },
    async createOrder(userId, orderData) {
      const order = await OrderModel.create({ ...orderData, userId });
      await Promise.all(
        orderData.items.map((item) => ProductModel.updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity } }))
      );
      return order;
    },
    async listOrders(userId) {
      return OrderModel.find({ userId }).sort({ createdAt: -1 });
    },
  };
}

function createJsonStore() {
  const dataDir = process.env.VERCEL ? path.join("/tmp", "marketlane-commerce") : path.join(__dirname, "data");
  const dataFile = path.join(dataDir, "dev-db.json");

  function ensureReady() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dataFile)) {
      writeDb({ users: [], products: seedProducts(), orders: [] });
      return;
    }

    const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    let changed = false;

    if (!Array.isArray(db.users)) {
      db.users = [];
      changed = true;
    }

    if (!Array.isArray(db.products) || db.products.length === 0) {
      db.products = seedProducts();
      changed = true;
    }

    if (!Array.isArray(db.orders)) {
      db.orders = [];
      changed = true;
    }

    if (changed) writeDb(db);
  }

  function readDb() {
    ensureReady();
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  }

  function writeDb(db) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
  }

  return {
    ensureReady,
    async findUserByEmail(email) {
      const db = readDb();
      return db.users.find((user) => user.email === email) || null;
    },
    async createUser(data) {
      const db = readDb();
      const user = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      writeDb(db);
      return user;
    },
    async listProducts(filters = {}) {
      const db = readDb();
      return db.products.filter((product) => productMatchesFilters(product, filters));
    },
    async findProductById(productId) {
      const db = readDb();
      return db.products.find((product) => product.id === productId) || null;
    },
    async getProductsByIds(productIds) {
      const db = readDb();
      const ids = new Set(productIds);
      return db.products.filter((product) => ids.has(product.id));
    },
    async createOrder(userId, orderData) {
      const db = readDb();

      orderData.items.forEach((item) => {
        const product = db.products.find((entry) => entry.id === item.productId);
        if (product) product.stock = Math.max(0, Number(product.stock || 0) - item.quantity);
      });

      const order = {
        id: crypto.randomUUID(),
        ...orderData,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.orders.unshift(order);
      writeDb(db);
      return order;
    },
    async listOrders(userId) {
      const db = readDb();
      return db.orders.filter((order) => order.userId === userId);
    },
  };
}

async function seedMongoProducts() {
  const count = await ProductModel.countDocuments();
  if (count > 0) return;
  await ProductModel.insertMany(seedProducts().map(({ id: _id, ...product }) => product));
}

function buildProductQuery(filters = {}) {
  const query = {};
  const category = String(filters.category || "").trim();
  const search = String(filters.search || "").trim();

  if (category && category !== "all") {
    query.category = category;
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), "i");
    query.$or = [{ name: pattern }, { description: pattern }, { category: pattern }, { tags: pattern }];
  }

  return query;
}

function productMatchesFilters(product, filters = {}) {
  const category = String(filters.category || "").trim();
  const search = String(filters.search || "").trim().toLowerCase();

  if (category && category !== "all" && product.category !== category) return false;
  if (!search) return true;

  return [product.name, product.description, product.category, ...(product.tags || [])].join(" ").toLowerCase().includes(search);
}

async function placeOrder(userId, body) {
  const requestedItems = sanitizeCartItems(body.items);
  const products = await store.getProductsByIds(requestedItems.map((item) => item.productId));
  const productMap = new Map(products.map((product) => [String(product.id || product._id), product]));

  const orderItems = requestedItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw badRequest("One of the products in your cart is no longer available.");

    const stock = Number(product.stock || 0);
    if (stock < item.quantity) {
      throw badRequest(`${product.name} has only ${stock} left in stock.`);
    }

    const priceCents = Number(product.priceCents || 0);
    return {
      productId: item.productId,
      name: product.name,
      image: product.image,
      priceCents,
      quantity: item.quantity,
      lineTotalCents: priceCents * item.quantity,
    };
  });

  const subtotalCents = orderItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const taxCents = Math.round(subtotalCents * 0.08);
  const shippingCents = subtotalCents >= 7500 ? 0 : 599;
  const totalCents = subtotalCents + taxCents + shippingCents;

  return store.createOrder(userId, {
    orderNumber: createOrderNumber(),
    items: orderItems,
    customer: sanitizeCustomer(body.customer),
    paymentMethod: sanitizePaymentMethod(body.paymentMethod),
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents,
    status: "Processing",
  });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  try {
    req.userId = verifyToken(token).sub;
    next();
  } catch {
    res.status(401).json({ message: "Please login to continue." });
  }
}

function createSession(user) {
  const publicUser = toClientUser(user);
  return {
    user: publicUser,
    token: signToken(publicUser.id),
  };
}

function toClientUser(user) {
  return {
    id: String(user.id || user._id),
    name: user.name,
    email: user.email,
  };
}

function toClientProduct(product) {
  return {
    id: String(product.id || product._id),
    name: product.name,
    slug: product.slug,
    description: product.description,
    category: product.category,
    image: product.image,
    priceCents: Number(product.priceCents || 0),
    stock: Number(product.stock || 0),
    rating: Number(product.rating || 0),
    tags: product.tags || [],
    specs: product.specs || [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function toClientOrder(order) {
  return {
    id: String(order.id || order._id),
    orderNumber: order.orderNumber,
    items: (order.items || []).map((item) => ({
      productId: String(item.productId),
      name: item.name,
      image: item.image,
      priceCents: Number(item.priceCents || 0),
      quantity: Number(item.quantity || 0),
      lineTotalCents: Number(item.lineTotalCents || 0),
    })),
    customer: order.customer,
    paymentMethod: order.paymentMethod,
    subtotalCents: Number(order.subtotalCents || 0),
    taxCents: Number(order.taxCents || 0),
    shippingCents: Number(order.shippingCents || 0),
    totalCents: Number(order.totalCents || 0),
    status: order.status || "Processing",
    createdAt: order.createdAt,
  };
}

function sanitizeCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest("Add at least one item to your cart before checkout.");
  }

  const merged = new Map();

  items.forEach((item) => {
    const productId = String(item.productId || "").trim();
    const quantity = Number.parseInt(item.quantity, 10);

    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw badRequest("Cart items must include a product and a quantity from 1 to 10.");
    }

    const nextQuantity = (merged.get(productId) || 0) + quantity;
    if (nextQuantity > 10) {
      throw badRequest("A single product can have a maximum checkout quantity of 10.");
    }

    merged.set(productId, nextQuantity);
  });

  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function sanitizeCustomer(customer = {}) {
  const clean = {
    name: cleanText(customer.name, 80),
    email: cleanText(customer.email, 120).toLowerCase(),
    phone: cleanText(customer.phone, 30),
    address: cleanText(customer.address, 140),
    city: cleanText(customer.city, 80),
    state: cleanText(customer.state, 80),
    zip: cleanText(customer.zip, 20),
  };

  if (!clean.name || !isEmail(clean.email) || !clean.address || !clean.city || !clean.state || !clean.zip) {
    throw badRequest("Enter a complete shipping address with a valid email.");
  }

  return clean;
}

function sanitizePaymentMethod(value) {
  return ["Card", "Cash on Delivery"].includes(value) ? value : "Card";
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function createOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ML-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function seedProducts() {
  return [
    {
      id: "bf1a0fa7-a2ac-4f5a-b8d0-100000000001",
      name: "Luma Wireless Headphones",
      slug: "luma-wireless-headphones",
      description: "Soft over-ear headphones with balanced audio, active noise reduction, and a 32-hour battery.",
      category: "Electronics",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
      priceCents: 8999,
      stock: 14,
      rating: 4.8,
      tags: ["audio", "wireless", "travel"],
      specs: [
        { label: "Battery", value: "32 hours" },
        { label: "Connectivity", value: "Bluetooth 5.3" },
        { label: "Warranty", value: "1 year" },
      ],
    },
    {
      id: "bf1a0fa7-a2ac-4f5a-b8d0-100000000002",
      name: "Everyday Canvas Tote",
      slug: "everyday-canvas-tote",
      description: "Durable cotton canvas tote with internal pockets, reinforced handles, and a water-resistant lining.",
      category: "Accessories",
      image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=80",
      priceCents: 3499,
      stock: 28,
      rating: 4.6,
      tags: ["bag", "daily carry", "canvas"],
      specs: [
        { label: "Material", value: "18 oz cotton canvas" },
        { label: "Capacity", value: "18 L" },
        { label: "Care", value: "Spot clean" },
      ],
    },
    {
      id: "bf1a0fa7-a2ac-4f5a-b8d0-100000000003",
      name: "Aero Stainless Bottle",
      slug: "aero-stainless-bottle",
      description: "Double-wall insulated bottle that keeps drinks cold for 24 hours or hot through the morning commute.",
      category: "Home",
      image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80",
      priceCents: 2799,
      stock: 35,
      rating: 4.7,
      tags: ["drinkware", "insulated", "home"],
      specs: [
        { label: "Volume", value: "24 oz" },
        { label: "Material", value: "18/8 stainless steel" },
        { label: "Lid", value: "Leak-resistant" },
      ],
    },
    {
      id: "bf1a0fa7-a2ac-4f5a-b8d0-100000000004",
      name: "Desk Bloom Lamp",
      slug: "desk-bloom-lamp",
      description: "Compact LED desk lamp with warm dimming, a weighted metal base, and a flexible reading arm.",
      category: "Home",
      image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
      priceCents: 5499,
      stock: 11,
      rating: 4.5,
      tags: ["lighting", "workspace", "led"],
      specs: [
        { label: "Modes", value: "5 brightness levels" },
        { label: "Power", value: "USB-C" },
        { label: "Finish", value: "Brushed metal" },
      ],
    },
    {
      id: "bf1a0fa7-a2ac-4f5a-b8d0-100000000005",
      name: "Stride Knit Sneakers",
      slug: "stride-knit-sneakers",
      description: "Lightweight knit sneakers with cushioned soles, breathable uppers, and a flexible city-walk fit.",
      category: "Footwear",
      image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      priceCents: 7499,
      stock: 18,
      rating: 4.4,
      tags: ["sneakers", "walking", "knit"],
      specs: [
        { label: "Upper", value: "Recycled knit" },
        { label: "Sole", value: "Foam cushion" },
        { label: "Fit", value: "True to size" },
      ],
    },
    {
      id: "bf1a0fa7-a2ac-4f5a-b8d0-100000000006",
      name: "Focus Planner Set",
      slug: "focus-planner-set",
      description: "A weekly planner, two fine-tip pens, sticky tabs, and a slim storage band for organized days.",
      category: "Stationery",
      image: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=900&q=80",
      priceCents: 2199,
      stock: 42,
      rating: 4.9,
      tags: ["planner", "paper", "stationery"],
      specs: [
        { label: "Pages", value: "160" },
        { label: "Paper", value: "100 gsm" },
        { label: "Layout", value: "Undated weekly" },
      ],
    },
  ];
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, "sha512").toString("hex");
  return `pbkdf2_sha512$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, iterations, salt, originalHash] = String(storedHash || "").split("$");
  if (algorithm !== "pbkdf2_sha512" || !iterations || !salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 64, "sha512").toString("hex");
  return safeEqual(hash, originalHash);
}

function signToken(userId) {
  const payload = {
    sub: String(userId),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new Error("Invalid token.");
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) throw new Error("Invalid token.");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Date.now()) throw new Error("Token expired.");
  return payload;
}

function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}
