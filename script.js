const API_BASE = "/api";
const SESSION_KEY = "marketlane-session-v1";
const CART_KEY = "marketlane-cart-v1";

const state = {
  products: [],
  orders: [],
  cart: [],
  user: null,
  token: "",
  search: "",
  category: "all",
  sort: "featured",
  route: "shop",
  selectedProductId: "",
  loadingProducts: false,
};

const els = {
  navLinks: document.querySelectorAll("[data-nav]"),
  shopView: document.querySelector("#shopView"),
  detailView: document.querySelector("#detailView"),
  ordersView: document.querySelector("#ordersView"),
  productGrid: document.querySelector("#productGrid"),
  productCount: document.querySelector("#productCount"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  searchInput: document.querySelector("#searchInput"),
  authButton: document.querySelector("#authButton"),
  logoutButton: document.querySelector("#logoutButton"),
  cartButton: document.querySelector("#cartButton"),
  cartCount: document.querySelector("#cartCount"),
  cartDrawer: document.querySelector("#cartDrawer"),
  closeCartButton: document.querySelector("#closeCartButton"),
  cartItems: document.querySelector("#cartItems"),
  cartSubtotal: document.querySelector("#cartSubtotal"),
  cartTax: document.querySelector("#cartTax"),
  cartShipping: document.querySelector("#cartShipping"),
  cartTotal: document.querySelector("#cartTotal"),
  checkoutForm: document.querySelector("#checkoutForm"),
  checkoutButton: document.querySelector("#checkoutButton"),
  shippingName: document.querySelector("#shippingName"),
  shippingEmail: document.querySelector("#shippingEmail"),
  shippingPhone: document.querySelector("#shippingPhone"),
  shippingAddress: document.querySelector("#shippingAddress"),
  shippingCity: document.querySelector("#shippingCity"),
  shippingState: document.querySelector("#shippingState"),
  shippingZip: document.querySelector("#shippingZip"),
  paymentMethod: document.querySelector("#paymentMethod"),
  ordersList: document.querySelector("#ordersList"),
  refreshOrdersButton: document.querySelector("#refreshOrdersButton"),
  authModal: document.querySelector("#authModal"),
  closeAuthButton: document.querySelector("#closeAuthButton"),
  authTitle: document.querySelector("#authTitle"),
  authTabs: document.querySelectorAll(".auth-tab"),
  loginForm: document.querySelector("#loginForm"),
  signupForm: document.querySelector("#signupForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  signupName: document.querySelector("#signupName"),
  signupEmail: document.querySelector("#signupEmail"),
  signupPassword: document.querySelector("#signupPassword"),
  loginNote: document.querySelector("#loginNote"),
  signupNote: document.querySelector("#signupNote"),
  scrim: document.querySelector("#scrim"),
  toast: document.querySelector("#toast"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  restoreSession();
  restoreCart();
  bindEvents();
  updateAuthUi();
  renderCart();
  loadProducts();
  routeFromHash();
}

function bindEvents() {
  window.addEventListener("hashchange", routeFromHash);

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    if (state.route !== "shop") location.hash = "shop";
    renderProducts();
  });

  els.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    renderProducts();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderProducts();
  });

  els.productGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "view") {
      location.hash = `product/${button.dataset.id}`;
    }

    if (button.dataset.action === "add") {
      addToCart(button.dataset.id, 1);
    }
  });

  els.detailView.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    if (button.dataset.action === "back") {
      location.hash = "shop";
    }

    if (button.dataset.action === "add-detail") {
      const quantity = Number.parseInt(document.querySelector("#detailQty")?.value, 10) || 1;
      addToCart(button.dataset.id, quantity);
    }
  });

  els.authButton.addEventListener("click", () => {
    if (state.user) {
      location.hash = "orders";
      return;
    }

    openAuth("login");
  });
  els.logoutButton.addEventListener("click", logout);
  els.cartButton.addEventListener("click", openCart);
  els.closeCartButton.addEventListener("click", closeCart);
  els.closeAuthButton.addEventListener("click", closeAuth);
  els.scrim.addEventListener("click", closeOverlays);
  els.refreshOrdersButton.addEventListener("click", loadOrders);

  els.ordersList.addEventListener("click", (event) => {
    if (event.target.closest("[data-auth-action]")) openAuth("login");
  });

  els.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchAuthPanel(tab.dataset.authPanel));
  });

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  els.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleSignup();
  });

  els.cartItems.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button) return;

    const productId = button.dataset.id;
    if (button.dataset.cartAction === "increase") updateCartQuantity(productId, 1);
    if (button.dataset.cartAction === "decrease") updateCartQuantity(productId, -1);
    if (button.dataset.cartAction === "remove") removeFromCart(productId);
  });

  els.checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await placeOrder();
  });
}

async function loadProducts() {
  state.loadingProducts = true;
  renderProducts();

  try {
    const data = await request("/products");
    state.products = data.products || [];
    populateCategories();
    sanitizeCartAgainstProducts();
    renderRoute();
    renderCart();
  } catch (error) {
    els.productGrid.innerHTML = `<div class="empty-state wide">The product API is unavailable. Start the Express server with npm start.</div>`;
    toast(error.message);
  } finally {
    state.loadingProducts = false;
  }
}

async function loadOrders() {
  if (!state.user) {
    renderOrders();
    openAuth("login");
    return;
  }

  try {
    const data = await request("/orders");
    state.orders = data.orders || [];
    renderOrders();
  } catch (error) {
    if (error.status === 401) {
      logout();
      openAuth("login");
      toast("Session expired. Please login again.");
      return;
    }
    toast(error.message);
  }
}

function routeFromHash() {
  const hash = window.location.hash.replace(/^#/, "") || "shop";

  if (hash.startsWith("product/")) {
    state.route = "product";
    state.selectedProductId = hash.split("/")[1] || "";
  } else if (hash === "orders") {
    state.route = "orders";
    state.selectedProductId = "";
  } else {
    state.route = "shop";
    state.selectedProductId = "";
  }

  renderRoute();
}

function renderRoute() {
  els.shopView.classList.toggle("hidden", state.route !== "shop");
  els.detailView.classList.toggle("hidden", state.route !== "product");
  els.ordersView.classList.toggle("hidden", state.route !== "orders");

  els.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === (state.route === "orders" ? "orders" : "shop"));
  });

  if (state.route === "shop") renderProducts();
  if (state.route === "product") renderProductDetail();
  if (state.route === "orders") {
    renderOrders();
    loadOrders();
  }
}

function renderProducts() {
  if (state.loadingProducts && !state.products.length) {
    els.productGrid.innerHTML = `<div class="empty-state wide">Loading products...</div>`;
    return;
  }

  const products = filteredProducts();
  els.productCount.textContent = products.length;

  if (!products.length) {
    els.productGrid.innerHTML = `<div class="empty-state wide">No products match your search.</div>`;
    return;
  }

  els.productGrid.innerHTML = products.map(renderProductCard).join("");
}

function renderProductCard(product) {
  const stockLabel = product.stock > 0 ? `${product.stock} in stock` : "Out of stock";
  const disabled = product.stock < 1 ? "disabled" : "";

  return `
    <article class="product-card">
      <button class="product-image-button" type="button" data-action="view" data-id="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)}">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </button>
      <div class="product-body">
        <div class="product-meta">
          <span>${escapeHtml(product.category)}</span>
          <span>${escapeHtml(formatRating(product.rating))}</span>
        </div>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.description)}</p>
        <div class="product-footer">
          <strong>${money(product.priceCents)}</strong>
          <span class="${product.stock > 0 ? "" : "danger-text"}">${escapeHtml(stockLabel)}</span>
        </div>
        <div class="card-actions">
          <button class="ghost-button" type="button" data-action="view" data-id="${escapeHtml(product.id)}">Details</button>
          <button class="primary-button" type="button" data-action="add" data-id="${escapeHtml(product.id)}" ${disabled}>Add to Cart</button>
        </div>
      </div>
    </article>
  `;
}

function renderProductDetail() {
  const product = state.products.find((item) => item.id === state.selectedProductId);

  if (!product) {
    els.detailView.innerHTML = `<div class="empty-state wide">Product not found.</div>`;
    return;
  }

  const disabled = product.stock < 1 ? "disabled" : "";
  const specs = (product.specs || [])
    .map((spec) => `<div><span>${escapeHtml(spec.label)}</span><strong>${escapeHtml(spec.value)}</strong></div>`)
    .join("");

  els.detailView.innerHTML = `
    <button class="ghost-button back-button" type="button" data-action="back">Back to Shop</button>
    <article class="detail-layout">
      <div class="detail-media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${escapeHtml(product.category)}</p>
        <h1>${escapeHtml(product.name)}</h1>
        <div class="rating-row">
          <span>${escapeHtml(formatRating(product.rating))}</span>
          <span>${product.stock > 0 ? `${product.stock} available` : "Out of stock"}</span>
        </div>
        <p class="detail-description">${escapeHtml(product.description)}</p>
        <div class="detail-price">${money(product.priceCents)}</div>
        <div class="spec-grid">${specs}</div>
        <div class="detail-actions">
          <label class="field qty-field">
            <span>Quantity</span>
            <input id="detailQty" type="number" min="1" max="${Math.max(product.stock, 1)}" value="1" ${disabled} />
          </label>
          <button class="primary-button" type="button" data-action="add-detail" data-id="${escapeHtml(product.id)}" ${disabled}>
            Add to Cart
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderOrders() {
  if (!state.user) {
    els.ordersList.innerHTML = `
      <div class="empty-state wide">
        <strong>Login to view order history.</strong>
        <button class="primary-button inline-action" type="button" data-auth-action="login">Login</button>
      </div>
    `;
    return;
  }

  if (!state.orders.length) {
    els.ordersList.innerHTML = `<div class="empty-state wide">No orders yet.</div>`;
    return;
  }

  els.ordersList.innerHTML = state.orders
    .map((order) => {
      const items = order.items
        .map((item) => `<span>${escapeHtml(item.name)} x ${item.quantity}</span>`)
        .join("");

      return `
        <article class="order-card">
          <div class="order-card-top">
            <div>
              <p class="eyebrow">${escapeHtml(formatDate(order.createdAt))}</p>
              <h3>${escapeHtml(order.orderNumber)}</h3>
            </div>
            <span class="status-badge">${escapeHtml(order.status)}</span>
          </div>
          <div class="order-items">${items}</div>
          <div class="order-total">
            <span>Total</span>
            <strong>${money(order.totalCents)}</strong>
          </div>
        </article>
      `;
    })
    .join("");
}

function filteredProducts() {
  const products = state.products
    .filter((product) => state.category === "all" || product.category === state.category)
    .filter((product) => {
      if (!state.search) return true;
      return [product.name, product.description, product.category, ...(product.tags || [])].join(" ").toLowerCase().includes(state.search);
    });

  return products.sort((a, b) => {
    if (state.sort === "price-low") return a.priceCents - b.priceCents;
    if (state.sort === "price-high") return b.priceCents - a.priceCents;
    if (state.sort === "rating") return b.rating - a.rating;
    return state.products.indexOf(a) - state.products.indexOf(b);
  });
}

function populateCategories() {
  const categories = [...new Set(state.products.map((product) => product.category))].sort();
  els.categoryFilter.innerHTML = [
    `<option value="all">All categories</option>`,
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`),
  ].join("");
  els.categoryFilter.value = state.category;
}

function addToCart(productId, quantity) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || product.stock < 1) return;

  const existing = state.cart.find((item) => item.productId === productId);
  const nextQuantity = Math.min(product.stock, (existing?.quantity || 0) + quantity);

  if (existing) {
    existing.quantity = nextQuantity;
  } else {
    state.cart.push({ productId, quantity: Math.min(product.stock, quantity) });
  }

  persistCart();
  renderCart();
  toast(`${product.name} added to cart.`);
}

function updateCartQuantity(productId, delta) {
  const product = state.products.find((item) => item.id === productId);
  state.cart = state.cart
    .map((item) => {
      if (item.productId !== productId) return item;
      const max = product ? Math.max(product.stock, 1) : 10;
      return { ...item, quantity: Math.max(1, Math.min(max, item.quantity + delta)) };
    })
    .filter((item) => item.quantity > 0);

  persistCart();
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.productId !== productId);
  persistCart();
  renderCart();
}

function sanitizeCartAgainstProducts() {
  if (!state.products.length) return;

  state.cart = state.cart
    .map((item) => {
      const product = state.products.find((entry) => entry.id === item.productId);
      if (!product || product.stock < 1) return null;
      return { ...item, quantity: Math.min(item.quantity, product.stock) };
    })
    .filter(Boolean);

  persistCart();
}

function renderCart() {
  const rows = state.cart
    .map((item) => {
      const product = state.products.find((entry) => entry.id === item.productId);
      return product ? { product, quantity: item.quantity } : null;
    })
    .filter(Boolean);

  els.cartCount.textContent = rows.reduce((sum, row) => sum + row.quantity, 0);

  if (!rows.length) {
    els.cartItems.innerHTML = `<div class="empty-state">Your cart is empty.</div>`;
  } else {
    els.cartItems.innerHTML = rows
      .map(
        ({ product, quantity }) => `
          <article class="cart-item">
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
            <div>
              <strong>${escapeHtml(product.name)}</strong>
              <span>${money(product.priceCents)}</span>
              <div class="quantity-stepper" aria-label="Quantity controls">
                <button type="button" data-cart-action="decrease" data-id="${escapeHtml(product.id)}">-</button>
                <span>${quantity}</span>
                <button type="button" data-cart-action="increase" data-id="${escapeHtml(product.id)}">+</button>
                <button class="remove-button" type="button" data-cart-action="remove" data-id="${escapeHtml(product.id)}">Remove</button>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  }

  const totals = calculateCartTotals();
  els.cartSubtotal.textContent = money(totals.subtotalCents);
  els.cartTax.textContent = money(totals.taxCents);
  els.cartShipping.textContent = totals.shippingCents === 0 ? "Free" : money(totals.shippingCents);
  els.cartTotal.textContent = money(totals.totalCents);
  els.checkoutButton.disabled = rows.length === 0;
}

function calculateCartTotals() {
  const subtotalCents = state.cart.reduce((sum, item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    return product ? sum + product.priceCents * item.quantity : sum;
  }, 0);
  const taxCents = Math.round(subtotalCents * 0.08);
  const shippingCents = subtotalCents === 0 || subtotalCents >= 7500 ? 0 : 599;
  return {
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
  };
}

async function placeOrder() {
  if (!state.user) {
    openAuth("login");
    toast("Login before checkout.");
    return;
  }

  if (!state.cart.length) {
    toast("Your cart is empty.");
    return;
  }

  const payload = {
    items: state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    customer: {
      name: els.shippingName.value,
      email: els.shippingEmail.value,
      phone: els.shippingPhone.value,
      address: els.shippingAddress.value,
      city: els.shippingCity.value,
      state: els.shippingState.value,
      zip: els.shippingZip.value,
    },
    paymentMethod: els.paymentMethod.value,
  };

  els.checkoutButton.disabled = true;
  els.checkoutButton.textContent = "Processing...";

  try {
    const data = await request("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.cart = [];
    persistCart();
    renderCart();
    closeCart();
    toast(`Order ${data.order.orderNumber} placed.`);
    await loadProducts();
    state.orders = [data.order, ...state.orders];
    location.hash = "orders";
  } catch (error) {
    toast(error.message);
  } finally {
    els.checkoutButton.disabled = false;
    els.checkoutButton.textContent = "Place Order";
  }
}

async function handleLogin() {
  els.loginNote.textContent = "Checking account...";

  try {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value,
      }),
    });
    setSession(data);
    closeAuth();
    toast("Logged in successfully.");
  } catch (error) {
    els.loginNote.textContent = error.message;
  }
}

async function handleSignup() {
  els.signupNote.textContent = "Creating account...";

  try {
    const data = await request("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: els.signupName.value.trim(),
        email: els.signupEmail.value.trim(),
        password: els.signupPassword.value,
      }),
    });
    setSession(data);
    closeAuth();
    toast("Account created.");
  } catch (error) {
    els.signupNote.textContent = error.message;
  }
}

function setSession(data) {
  state.user = data.user;
  state.token = data.token;
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  updateAuthUi();
  fillShippingDefaults();
}

function restoreSession() {
  const saved = readJson(SESSION_KEY, null);
  if (!saved || !saved.user || !saved.token) return;
  state.user = saved.user;
  state.token = saved.token;
}

function restoreCart() {
  state.cart = readJson(CART_KEY, []);
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  state.user = null;
  state.token = "";
  state.orders = [];
  updateAuthUi();
  if (state.route === "orders") renderOrders();
  toast("Logged out.");
}

function updateAuthUi() {
  if (state.user) {
    els.authButton.textContent = state.user.name || "Account";
    els.authButton.disabled = false;
    els.logoutButton.classList.remove("hidden");
  } else {
    els.authButton.textContent = "Login";
    els.authButton.disabled = false;
    els.logoutButton.classList.add("hidden");
  }
}

function openCart() {
  fillShippingDefaults();
  els.cartDrawer.classList.add("open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
  els.scrim.classList.remove("hidden");
}

function closeCart() {
  els.cartDrawer.classList.remove("open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
  if (els.authModal.classList.contains("hidden")) els.scrim.classList.add("hidden");
}

function openAuth(panel = "login") {
  switchAuthPanel(panel);
  els.authModal.classList.remove("hidden");
  els.scrim.classList.remove("hidden");
  window.setTimeout(() => (panel === "login" ? els.loginEmail : els.signupName).focus(), 50);
}

function closeAuth() {
  els.authModal.classList.add("hidden");
  if (!els.cartDrawer.classList.contains("open")) els.scrim.classList.add("hidden");
  els.loginNote.textContent = "";
  els.signupNote.textContent = "";
}

function closeOverlays() {
  closeAuth();
  closeCart();
}

function switchAuthPanel(panel) {
  const login = panel === "login";
  els.loginForm.classList.toggle("hidden", !login);
  els.signupForm.classList.toggle("hidden", login);
  els.authTitle.textContent = login ? "Login" : "Create account";
  els.authTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.authPanel === panel));
  els.loginNote.textContent = "";
  els.signupNote.textContent = "";
}

function fillShippingDefaults() {
  if (!state.user) return;
  if (!els.shippingName.value) els.shippingName.value = state.user.name || "";
  if (!els.shippingEmail.value) els.shippingEmail.value = state.user.email || "";
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    const networkError = new Error("The backend is not reachable.");
    networkError.originalError = error;
    throw networkError;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiError = new Error(data.message || "Request failed.");
    apiError.status = response.status;
    throw apiError;
  }

  return data;
}

function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);
}

function formatRating(rating) {
  return `${Number(rating || 0).toFixed(1)} rating`;
}

function formatDate(value) {
  if (!value) return "Today";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

let toastTimer = 0;
function toast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}
