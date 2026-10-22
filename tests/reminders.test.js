import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reminderCandidate,
  addCalendarDays,
} from "../src/lib/reminder-schedule.js";
const plant = {
  id: "plant-one",
  acquired: "2026-10-01",
  lastWatered: "2026-10-15",
  interval: 7,
};
const preferences = { enabled: true, timeZone: "America/Sao_Paulo", hour: 9 };
test("lembrete respeita dia, hora e fuso do usuário", () => {
  assert.equal(
    reminderCandidate(plant, preferences, new Date("2026-10-22T11:59:00Z")),
    null,
  );
  assert.equal(
    reminderCandidate(plant, preferences, new Date("2026-10-21T14:00:00Z")),
    null,
  );
  assert.equal(
    reminderCandidate(plant, preferences, new Date("2026-10-22T12:00:00Z"))
      .dueOn,
    "2026-10-22",
  );
});
test("calendário atravessa meses, ano bissexto e mudança de horário de verão", () => {
  assert.equal(addCalendarDays("2026-12-30", 5), "2027-01-04");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(
    reminderCandidate(
      { ...plant, lastWatered: "2026-03-01" },
      { ...preferences, timeZone: "America/New_York" },
      new Date("2026-03-08T12:30:00Z"),
    ),
    null,
  );
  assert.equal(
    reminderCandidate(
      { ...plant, lastWatered: "2026-03-01" },
      { ...preferences, timeZone: "America/New_York" },
      new Date("2026-03-08T13:00:00Z"),
    ).dueOn,
    "2026-03-08",
  );
});
test("nova rega troca o ciclo; lembrete depende de consentimento explícito", () => {
  const first = reminderCandidate(
    plant,
    preferences,
    new Date("2026-10-22T12:00:00Z"),
  );
  const overdue = reminderCandidate(
    plant,
    preferences,
    new Date("2026-10-23T12:00:00Z"),
  );
  assert.equal(first.cycleKey, overdue.cycleKey);
  assert.equal(
    reminderCandidate(
      plant,
      { ...preferences, enabled: false },
      new Date("2026-10-22T12:00:00Z"),
    ),
    null,
  );
  assert.equal(
    reminderCandidate(
      { ...plant, lastWatered: "2026-10-22" },
      preferences,
      new Date("2026-10-22T12:00:00Z"),
    ),
    null,
  );
  assert.throws(() => addCalendarDays("2026-02-31", 7));
});
