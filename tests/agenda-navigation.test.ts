import test from "node:test";
import assert from "node:assert/strict";
import { isAgendaNavItemActive } from "../client/src/lib/agenda-nav";

test("agenda navigation activates only Agenda Items on /agenda", () => {
  assert.equal(isAgendaNavItemActive("/agenda", "/agenda"), true);
  assert.equal(isAgendaNavItemActive("/agenda", "/agenda/displays"), false);
});

test("agenda navigation normalizes trailing slashes", () => {
  assert.equal(isAgendaNavItemActive("/agenda/", "/agenda"), true);
  assert.equal(isAgendaNavItemActive("/agenda/displays/", "/agenda/displays"), true);
  assert.equal(isAgendaNavItemActive("/agenda/displays/", "/agenda"), false);
});

test("agenda navigation prefers the more specific Displays route", () => {
  assert.equal(isAgendaNavItemActive("/agenda/displays", "/agenda/displays"), true);
  assert.equal(isAgendaNavItemActive("/agenda/displays", "/agenda"), false);
  assert.equal(isAgendaNavItemActive("/agenda/displays/editor", "/agenda/displays"), true);
  assert.equal(isAgendaNavItemActive("/agenda/displays/editor", "/agenda"), false);
});

test("agenda navigation keeps supported Agenda Items descendants on Items", () => {
  assert.equal(isAgendaNavItemActive("/agenda/import", "/agenda"), true);
  assert.equal(isAgendaNavItemActive("/agenda/import", "/agenda/displays"), false);
});

test("agenda navigation is path-segment aware", () => {
  assert.equal(isAgendaNavItemActive("/agenda-display", "/agenda"), false);
  assert.equal(isAgendaNavItemActive("/agenda-display", "/agenda/displays"), false);
  assert.equal(isAgendaNavItemActive("/agenda/displays-other", "/agenda/displays"), false);
});