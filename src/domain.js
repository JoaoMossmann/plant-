export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dueDays(plant, now = new Date()) {
  const start = plant.lastWatered || plant.acquired;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${dayKey(now)}T12:00:00`);
  return Number(plant.interval) - Math.round((b - a) / 86400000);
}
export function validateBackup(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.plants))
    throw new Error("Arquivo de backup inválido.");
  if (data.plants.length > 1000)
    throw new Error("O backup excede o limite de 1.000 plantas.");
  const ids = new Set();
  return data.plants.map((p) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      p.id.length > 100 ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 80 ||
      typeof p.species !== "string" ||
      !p.species.trim() ||
      p.species.length > 120 ||
      !Number.isInteger(p.interval) ||
      p.interval < 1 ||
      p.interval > 365 ||
      !validDate(p.acquired) ||
      (p.lastWatered && !validDate(p.lastWatered)) ||
      !Array.isArray(p.history) ||
      p.history.length > 2000 ||
      p.history.some(
        (h) =>
          !h ||
          !validDate(h.date) ||
          typeof h.type !== "string" ||
          !h.type ||
          h.type.length > 80,
      ) ||
      (p.notes !== undefined &&
        (typeof p.notes !== "string" || p.notes.length > 2000)) ||
      (p.photo &&
        (typeof p.photo !== "string" ||
          p.photo.length > 3 * 1024 * 1024 ||
          !/^data:image\/(jpeg|png|webp);base64,/.test(p.photo)))
    ) {
      throw new Error("O backup contém uma planta com dados inválidos.");
    }
    ids.add(p.id);
    // Uma lista explícita evita importar metadados de conta ou propriedades arbitrárias.
    return {
      id: p.id,
      name: p.name,
      species: p.species,
      interval: p.interval,
      acquired: p.acquired,
      lastWatered: p.lastWatered || null,
      history: p.history.map((h) => ({ date: h.date, type: h.type })),
      catalogId: typeof p.catalogId === "string" ? p.catalogId : "",
      notes: p.notes || "",
      photo: p.photo || "",
    };
  });
}
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T12:00:00Z");
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
export function recommend(plants, { light, pets, region, space }) {
  return plants.filter(
    (p) =>
      light !== "nenhuma" &&
      p.regions.includes(region) &&
      (!space || space === "todos" || p.space === space) &&
      (!pets || p.pets === true) &&
      (light === "baixa"
        ? p.light === "baixa"
        : light === "sol"
          ? p.light === "sol"
          : p.light !== "sol"),
  );
}
