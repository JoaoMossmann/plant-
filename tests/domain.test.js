import { test } from "node:test";
import assert from "node:assert/strict";
import { dueDays, validateBackup, recommend, dayKey } from "../src/domain.js";
import { catalog } from "../src/catalog.js";
const plant = {
  id: "one",
  name: "Maranta",
  species: "Maranta leuconeura",
  acquired: "2026-10-01",
  lastWatered: "2026-10-20",
  interval: 5,
  history: [],
};
test("reminder uses last watering and crosses month/year boundaries", () => {
  assert.equal(dueDays(plant, new Date("2026-10-21T12:00:00")), 4);
  assert.equal(
    dueDays(
      { ...plant, lastWatered: "2026-12-30" },
      new Date("2027-01-05T12:00:00"),
    ),
    -1,
  );
});
test("without watering, reminder starts with acquisition", () => {
  assert.equal(
    dueDays({ ...plant, lastWatered: null }, new Date("2026-10-06T12:00:00")),
    0,
  );
});
test("pet-safe low light room never recommends toxic species", () => {
  const result = recommend(catalog, {
    light: "baixa",
    pets: true,
    region: "Sul",
  });
  assert.equal(result.length, 0);
});
test("indirect light recommendations match all filters", () => {
  const result = recommend(catalog, {
    light: "indireta",
    pets: true,
    region: "Sul",
  });
  assert.ok(result.length > 0);
  assert.ok(
    result.every(
      (p) => p.pets && p.light !== "sol" && p.regions.includes("Sul"),
    ),
  );
});
test("no natural light gives no recommendations", () => {
  assert.equal(
    recommend(catalog, { light: "nenhuma", pets: false, region: "Sul" }).length,
    0,
  );
});
test("valid backup roundtrips, malformed and duplicate records rejected", () => {
  assert.deepEqual(
    validateBackup(
      JSON.parse(JSON.stringify({ version: 1, plants: [plant] })),
    )[0].history,
    plant.history,
  );
  assert.equal(
    validateBackup({ version: 1, plants: [{ ...plant, extra: "ignored" }] })[0]
      .extra,
    undefined,
  );
  for (const data of [
    {},
    { version: 1, plants: [{ ...plant, interval: 0 }] },
    { version: 1, plants: [plant, plant] },
    {
      version: 1,
      plants: [{ ...plant, photo: "https://malicious.example/a" }],
    },
    { version: 1, plants: [{ ...plant, history: [null] }] },
  ])
    assert.throws(() => validateBackup(data));
});
test("catalog has unique identities and required care information", () => {
  assert.equal(new Set(catalog.map((p) => p.id)).size, catalog.length);
  assert.ok(
    catalog.every(
      (p) => p.care && p.scientific && p.water > 0 && p.regions.length,
    ),
  );
});

test("rejects rolled-over dates and invalid strings in backups", () => {
  for (const p of [
    { ...plant, acquired: "2026-02-31" },
    { ...plant, notes: 99 },
    { ...plant, name: "x".repeat(81) },
  ])
    assert.throws(() => validateBackup({ version: 1, plants: [p] }));
});

test("fichas têm fontes e fotos locais; classificação ausente não vira indicação segura", async () => {
  const { readFile } = await import("node:fs/promises");
  assert.ok(catalog.length >= 40);
  for (const p of catalog) {
    assert.ok(p.sources.some((s) => s.label.includes("Cultivo")));
    if (p.pets !== null)
      assert.ok(p.sources.some((s) => s.label.includes("Toxicidade")));
    const image = await readFile(new URL(p.photo));
    assert.ok(image.length > 4000);
    assert.equal(image[0], 0xff);
    assert.equal(image[1], 0xd8);
    assert.ok(
      p.image.author &&
        p.image.page.startsWith("https://commons.wikimedia.org/") &&
        p.image.license,
    );
  }
  assert.ok(
    recommend([{ regions: ["Sul"], light: "indireta", pets: null }], {
      region: "Sul",
      light: "indireta",
      pets: true,
    }).length === 0,
  );
});

test("sugestão para espaço pequeno não inclui plantas que exigem mais espaço", () => {
  const small = recommend(catalog, {
    region: "Sul",
    light: "indireta",
    pets: false,
    space: "compacto",
  });
  assert.ok(small.length > 0);
  assert.ok(small.every((p) => p.space === "compacto"));
  assert.ok(!small.some((p) => p.id === "ficus-lyrata" || p.id === "costela"));
});
