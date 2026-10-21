import React from "react";
import { spaceNames } from "../catalog";
export function CatalogPhoto({ plant }) {
  return (
    <img
      src={plant.photo}
      style={{ objectFit: plant.image.fit || "cover" }}
      alt={plant.image.alt}
      loading="lazy"
      decoding="async"
    />
  );
}
export function PlantReferences({ plant }) {
  return (
    <div className="plant-references">
      <p className="space-note">
        <strong>{spaceNames[plant.space]}</strong>
        {plant.space === "amplo"
          ? " · O exemplar da foto pode ser jovem; considere o espaço que a planta adulta vai ocupar."
          : plant.space === "externo"
            ? " · Indicada para cultivo externo nas condições descritas na ficha."
            : " · Uma opção para começar em vaso; acompanhe o crescimento e o espaço disponível."}
      </p>
      <h3>Fontes da ficha</h3>
      <ul>
        {plant.sources.map((source) => (
          <li key={source.label}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.label}
            </a>
            <span>
              Consulta: {source.checkedAt.split("-").reverse().join("/")}
            </span>
          </li>
        ))}
      </ul>
      {plant.pets === null && (
        <p>
          A toxicidade para cães e gatos ainda não foi confirmada nesta ficha.
          Mantenha fora do alcance de animais até confirmar com uma fonte
          especializada.
        </p>
      )}
      <div className="photo-credit">
        <strong>Fotografia de referência</strong>
        {plant.image.caption && <p>{plant.image.caption}</p>}
        <p>
          <a href={plant.image.page} target="_blank" rel="noreferrer">
            {plant.image.title.replace("File:", "")}
          </a>{" "}
          · {plant.image.author} ·{" "}
          <a
            href={plant.image.licenseUrl || plant.image.page}
            target="_blank"
            rel="noreferrer"
          >
            {plant.image.license}
          </a>
        </p>
        <p>
          Exemplares e variedades podem ter aparência diferente. A foto não
          substitui identificação da sua planta.
        </p>
      </div>
    </div>
  );
}
