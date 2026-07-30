// Fixture tests for the pure customer-portal helpers (no network / no session).
// Run: node --test src/lib/portalLogic.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyApproval,
  isPortalOverdue,
  buildContactArgs,
  safeErrorMessage,
  outstandingBalance,
  quoteLooksApprovable,
} from "./portalLogic.js";

test("classifyApproval: accepted", () => {
  const r = classifyApproval({ quote_id: "q1", status: "accepted", approved: true });
  assert.deepEqual(r, { status: "accepted", approved: true, quoteId: "q1" });
});

test("classifyApproval: expired is not an error", () => {
  const r = classifyApproval({ quote_id: "q2", status: "expired", approved: false });
  assert.equal(r.status, "expired");
  assert.equal(r.approved, false);
});

test("classifyApproval: unknown/garbage", () => {
  assert.equal(classifyApproval(null).status, "unknown");
  assert.equal(classifyApproval({ status: "weird" }).approved, false);
});

test("isPortalOverdue: past-due unpaid balance is overdue", () => {
  const inv = { status: "sent", due_date: "2000-01-01", balance: 100 };
  assert.equal(isPortalOverdue(inv), true);
});

test("isPortalOverdue: paid/void/draft never overdue", () => {
  assert.equal(isPortalOverdue({ status: "paid", due_date: "2000-01-01", balance: 100 }), false);
  assert.equal(isPortalOverdue({ status: "void", due_date: "2000-01-01", balance: 100 }), false);
  assert.equal(isPortalOverdue({ status: "draft", due_date: "2000-01-01", balance: 100 }), false);
});

test("isPortalOverdue: future due date not overdue", () => {
  assert.equal(isPortalOverdue({ status: "sent", due_date: "2999-01-01", balance: 100 }), false);
});

test("isPortalOverdue: zero balance not overdue", () => {
  assert.equal(isPortalOverdue({ status: "sent", due_date: "2000-01-01", balance: 0 }), false);
});

test("buildContactArgs: trims and maps to RPC arg names", () => {
  const args = buildContactArgs({ firstName: "  Jo ", lastName: "Doe", email: "", phone: " 504 " });
  assert.deepEqual(args, {
    p_first_name: "Jo",
    p_last_name: "Doe",
    p_email: "",
    p_phone: "504",
  });
});

test("safeErrorMessage: maps known messages, hides internals", () => {
  assert.equal(safeErrorMessage(new Error("Not authorized as a customer")), "Not authorized as a customer.");
  assert.equal(
    safeErrorMessage(new Error("This quote is not awaiting a decision (current status: accepted)")),
    "This quote is no longer awaiting your decision."
  );
  assert.equal(safeErrorMessage(new Error("pg: relation does not exist 42P01")), "Something went wrong. Please try again.");
});

test("outstandingBalance: sums only unpaid positive balances", () => {
  const items = [
    { status: "sent", balance: 100 },
    { status: "partially_paid", balance: 50.5 },
    { status: "paid", balance: 0 },
    { status: "void", balance: 999 },
    { status: "draft", balance: 999 },
    { status: "sent", balance: -5 },
  ];
  assert.equal(outstandingBalance(items), 150.5);
});

test("quoteLooksApprovable: sent/viewed & not expired", () => {
  assert.equal(quoteLooksApprovable({ status: "sent" }), true);
  assert.equal(quoteLooksApprovable({ status: "viewed" }), true);
  assert.equal(quoteLooksApprovable({ status: "accepted" }), false);
  assert.equal(quoteLooksApprovable({ status: "draft" }), false);
  assert.equal(
    quoteLooksApprovable({ status: "sent", expires_at: "2000-01-01" }),
    false
  );
  assert.equal(
    quoteLooksApprovable({ status: "sent", expires_at: "2999-01-01" }),
    true
  );
});
