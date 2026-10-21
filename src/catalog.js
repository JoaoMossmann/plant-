import data from "./catalog-data.json" with { type: "json" };
export const catalog = data.map((p) => ({
  ...p,
  photo: new URL(`./assets/plants/${p.id}.jpg`, import.meta.url).href,
}));
export const lightNames = {
  baixa: "Tolera pouca luz",
  indireta: "Luz indireta",
  sol: "Sol direto",
};
export function toxicityLabel(plant) {
  return plant.pets === true
    ? "Não tóxica*"
    : plant.pets === false
      ? "Tóxica a pets"
      : "Toxicidade não confirmada";
}
