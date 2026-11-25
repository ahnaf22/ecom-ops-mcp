import { db } from "./database.js";

const customers = [
  [1, "Ava Rahman", "ava.rahman@example.com", "gold"],
  [2, "Liam Carter", "liam.carter@example.com", "silver"],
  [3, "Sophia Nguyen", "sophia.nguyen@example.com", "platinum"],
  [4, "Noah Williams", "noah.williams@example.com", "bronze"],
  [5, "Mia Patel", "mia.patel@example.com", "gold"],
  [6, "Ethan Brown", "ethan.brown@example.com", "silver"],
  [7, "Isabella Garcia", "isabella.garcia@example.com", "gold"],
  [8, "Lucas Martin", "lucas.martin@example.com", "bronze"],
  [9, "Amelia Wilson", "amelia.wilson@example.com", "platinum"],
  [10, "Oliver Chen", "oliver.chen@example.com", "silver"],
  [11, "Harper Davis", "harper.davis@example.com", "bronze"],
  [12, "Elijah Moore", "elijah.moore@example.com", "gold"],
  [13, "Evelyn Taylor", "evelyn.taylor@example.com", "silver"],
  [14, "James Anderson", "james.anderson@example.com", "bronze"],
  [15, "Luna Thompson", "luna.thompson@example.com", "platinum"],
] as const;

const products = [
  [1, "ELC-1001", "Wireless Noise-Canceling Headphones", 42, 10, 12999],
  [2, "ELC-1002", "USB-C Charging Hub", 68, 15, 4999],
  [3, "ELC-1003", "Mechanical Keyboard", 31, 8, 8999],
  [4, "ELC-1004", "Ergonomic Wireless Mouse", 55, 12, 5999],
  [5, "HOM-2001", "Smart LED Desk Lamp", 27, 8, 4599],
  [6, "HOM-2002", "Stainless Steel Water Bottle", 73, 20, 2499],
  [7, "HOM-2003", "Bamboo Cutting Board Set", 34, 10, 3299],
  [8, "HOM-2004", "Digital Kitchen Scale", 29, 7, 2799],
  [9, "FIT-3001", "Non-Slip Yoga Mat", 47, 12, 3999],
  [10, "FIT-3002", "Adjustable Resistance Bands", 61, 15, 2999],
  [11, "FIT-3003", "Insulated Running Belt", 38, 10, 2199],
  [12, "OFF-4001", "Hardcover Weekly Planner", 82, 20, 1899],
  [13, "OFF-4002", "Gel Pen Set", 96, 25, 1599],
  [14, "OFF-4003", "Laptop Stand", 24, 6, 5499],
  [15, "PET-5001", "Orthopedic Pet Bed", 18, 5, 7499],
  [16, "ELC-1010", "Portable Bluetooth Speaker", 3, 10, 6999],
  [17, "HOM-2010", "Aroma Diffuser", 5, 8, 3599],
  [18, "FIT-3010", "Foam Roller", 2, 6, 2899],
  [19, "OFF-4010", "Cable Organizer Kit", 4, 12, 1299],
  [20, "PET-5010", "Automatic Pet Feeder", 1, 5, 8999],
] as const;

const statuses = [
  "pending",
  "paid",
  "shipped",
  "failed_webhook",
  "refunded",
] as const;

const paymentByStatus = {
  pending: "pending",
  paid: "paid",
  shipped: "paid",
  failed_webhook: "failed",
  refunded: "refunded",
} as const;

const seed = db.transaction(() => {
  db.exec(
    "DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM customers",
  );

  const insertCustomer = db.prepare(
    "INSERT INTO customers (id, name, email, tier) VALUES (?, ?, ?, ?)",
  );
  const insertProduct = db.prepare(
    `INSERT INTO products
      (id, sku, name, stock_qty, reorder_level, price_cents)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertOrder = db.prepare(
    `INSERT INTO orders
      (id, customer_id, status, total_cents, payment_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertOrderItem = db.prepare(
    `INSERT INTO order_items
      (id, order_id, product_id, quantity, unit_price_cents)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const customer of customers) insertCustomer.run(...customer);
  for (const product of products) insertProduct.run(...product);

  const start = Date.UTC(2026, 8, 1, 9, 0, 0);
  for (let index = 0; index < 50; index += 1) {
    const status = statuses[index % statuses.length];
    const customerId = ((index * 7) % customers.length) + 1;
    const itemCount = (index % 3) + 1;
    const items = Array.from({ length: itemCount }, (_, itemIndex) => {
      const product = products[(index * 3 + itemIndex * 7) % products.length];
      const quantity = ((index + itemIndex) % 3) + 1;
      return { product, quantity };
    });
    const totalCents = items.reduce(
      (total, item) => total + item.product[5] * item.quantity,
      0,
    );
    const createdAt = new Date(start + index * 36 * 60 * 60 * 1000).toISOString();

    insertOrder.run(
      index + 1,
      customerId,
      status,
      totalCents,
      paymentByStatus[status],
      createdAt,
    );

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      insertOrderItem.run(
        index * 3 + itemIndex + 1,
        index + 1,
        item.product[0],
        item.quantity,
        item.product[5],
      );
    }
  }
});

seed();
db.close();
