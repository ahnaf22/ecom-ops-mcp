import { describe, expect, it } from "vitest";
import { validateReadOnlySql } from "./guard.js";

describe("validateReadOnlySql", () => {
  it("allows SELECT and adds the row cap", () => {
    expect(validateReadOnlySql(" SELECT * FROM products ")).toBe(
      "SELECT * FROM products LIMIT 50",
    );
  });

  it("reduces an excessive limit", () => {
    expect(validateReadOnlySql("SELECT * FROM orders LIMIT 500")).toBe(
      "SELECT * FROM orders LIMIT 50",
    );
  });

  it("caps the outer limit when a subquery also has a limit", () => {
    expect(
      validateReadOnlySql(
        "SELECT * FROM (SELECT * FROM orders LIMIT 500) LIMIT 200",
      ),
    ).toBe("SELECT * FROM (SELECT * FROM orders LIMIT 500) LIMIT 50");
  });

  it.each([
    "UPDATE products SET stock_qty = 0",
    "SELECT * FROM products; DROP TABLE products",
    "SELECT * FROM products WHERE id IN (DELETE FROM products)",
    "PRAGMA table_info(products)",
  ])("rejects unsafe SQL: %s", (sql) => {
    expect(() => validateReadOnlySql(sql)).toThrow();
  });
});
