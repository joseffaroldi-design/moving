// Fixture tests for the pure crew-mobile helpers (no network / no session).
// Run: node --test src/lib/crewLogic.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { isNotCrewError, crewErrorMessage, crewRoleLabel } from "./crewLogic.js";

test("isNotCrewError: detects the not-authorized-as-crew message", () => {
  assert.equal(isNotCrewError(new Error("Not authorized as crew")), true);
  assert.equal(isNotCrewError(new Error("Job not found")), false);
  assert.equal(isNotCrewError("Not authorized as crew (rpc)"), true);
  assert.equal(isNotCrewError(null), false);
});

test("crewErrorMessage: maps known messages, hides internals", () => {
  assert.equal(crewErrorMessage(new Error("Not authorized as crew")), "You don't have crew access to this app.");
  assert.equal(crewErrorMessage(new Error("Job not found")), "This job isn't assigned to you.");
  assert.equal(crewErrorMessage(new Error("pg: permission denied 42501")), "Something went wrong. Please try again.");
});

test("crewRoleLabel: maps crew roles", () => {
  assert.equal(crewRoleLabel("crew_lead"), "Crew Lead");
  assert.equal(crewRoleLabel("mover"), "Mover");
  assert.equal(crewRoleLabel(""), "");
  assert.equal(crewRoleLabel("helper_extra"), "Helper Extra");
  assert.equal(crewRoleLabel(null), "");
});
