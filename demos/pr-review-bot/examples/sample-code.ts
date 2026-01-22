// Sample code with intentional issues for the PR Review Bot to find

import { db } from './database';

// Security Issue: SQL injection vulnerability
export function getUserByName(name: string) {
  const query = `SELECT * FROM users WHERE name = '${name}'`;
  return db.execute(query);
}

// Security Issue: Hardcoded credentials
const API_KEY = "sk-1234567890abcdef";

// Style Issue: Function too complex, deeply nested
export function processOrder(order: any, user: any, config: any) {
  if (order) {
    if (order.items) {
      if (order.items.length > 0) {
        for (let i = 0; i < order.items.length; i++) {
          if (order.items[i].quantity > 0) {
            if (order.items[i].price > 0) {
              if (user) {
                if (user.balance >= order.items[i].price * order.items[i].quantity) {
                  // process
                  console.log('processing');
                }
              }
            }
          }
        }
      }
    }
  }
}

// Documentation Issue: No docstring, unclear parameters
export function calc(a, b, c, op) {
  if (op === 1) return a + b + c;
  if (op === 2) return a * b * c;
  if (op === 3) return a - b - c;
  return 0;
}

// Testing Issue: Tightly coupled, hard to test
export class OrderProcessor {
  process(orderId: string) {
    const order = db.query(`SELECT * FROM orders WHERE id = ${orderId}`);
    const user = db.query(`SELECT * FROM users WHERE id = ${order.userId}`);
    const result = fetch(`https://api.payment.com/charge?key=${API_KEY}&amount=${order.total}`);
    db.execute(`UPDATE orders SET status = 'processed' WHERE id = ${orderId}`);
    return result;
  }
}

// Good code for comparison - should get positive feedback
/**
 * Calculates the total price for a list of items with tax.
 * @param items - Array of items with price and quantity
 * @param taxRate - Tax rate as a decimal (e.g., 0.08 for 8%)
 * @returns Total price including tax
 */
export function calculateTotal(
  items: Array<{ price: number; quantity: number }>,
  taxRate: number
): number {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  return subtotal * (1 + taxRate);
}
