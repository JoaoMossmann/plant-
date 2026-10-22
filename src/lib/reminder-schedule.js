// Cálculo de calendário independente de canal ou provedor de entrega.
const formatterCache = new Map();
export function localClock(now, timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  const fields = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${fields.year}-${fields.month}-${fields.day}`,
    hour: Number(fields.hour),
  };
}
export function addCalendarDays(date, days) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  )
    throw new Error("Invalid reminder date or interval");
  const parsed = new Date(date + "T12:00:00Z");
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid reminder date");
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
export function reminderCandidate(plant, preferences, now = new Date()) {
  if (!preferences.enabled) return null;
  if (
    !Number.isInteger(preferences.hour) ||
    preferences.hour < 0 ||
    preferences.hour > 23
  )
    throw new Error("Invalid reminder hour");
  const clock = localClock(now, preferences.timeZone);
  const anchor = plant.lastWatered || plant.acquired;
  const dueOn = addCalendarDays(anchor, plant.interval);
  if (clock.date < dueOn || clock.hour < preferences.hour) return null;
  return {
    plantId: plant.id,
    anchor,
    dueOn,
    kind: "check_soil",
    cycleKey: `${plant.id}:${anchor}`,
  };
}
