# MarketLane Commerce

A basic e-commerce site built with HTML, CSS, JavaScript, Node.js, Express.js, and MongoDB support. It includes product listings, product details, a shopping cart, checkout/order processing, and user registration/login.

## Features

- Product catalog with search, category filter, and sorting
- Product details page using hash routing
- Shopping cart with quantity controls and local persistence
- User signup and login with hashed passwords
- Checkout form and order processing
- Order history for logged-in users
- Database storage for products, users, and orders
- MongoDB support with a local JSON database fallback for development

## Technologies

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Database: MongoDB with Mongoose, or `data/dev-db.json` when MongoDB is not configured

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Optional: create a `.env` file from `.env.example` and add your MongoDB connection string.

```bash
PORT=3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/marketlane-commerce
TOKEN_SECRET=your-long-secret-value
```

3. Start the app:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

If `MONGODB_URI` is not configured, the server stores users, seeded products, and orders in `data/dev-db.json`.

## API Routes

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/orders`
- `GET /api/orders`

`POST /api/orders` and `GET /api/orders` require a bearer token returned by login/signup.

## Project Structure

```text
.
|-- index.html          Frontend page structure
|-- styles.css          Responsive storefront styling
|-- script.js           Frontend cart, auth, routing, and API logic
|-- server.js           Express API, auth, products, orders, database layer
|-- api/[...path].js    Vercel serverless entry point
|-- package.json        Node project scripts and dependencies
|-- .env.example        Environment variable template
```
