import data from "./catalog-data.json" with { type: "json" };
const largerPlants = new Set([
  "areca",
  "ficus-elastica",
  "ficus-benjamina",
  "ficus-lyrata",
  "cheflera",
  "costela",
  "croton",
  "pata-elefante",
]);
const gardenPlants = new Set(["cica", "coroa", "rosa"]);
export const catalog = data.map((p) => ({
  ...p,
  space: gardenPlants.has(p.id)
    ? "externo"
    : largerPlants.has(p.id)
      ? "amplo"
      : "compacto",
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

export const spaceNames = {
  compacto: "Vasos e pequenos espaços",
  amplo: "Mais espaço para crescer",
  externo: "Jardins externos",
};
