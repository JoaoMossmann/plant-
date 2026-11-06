export const pagePaths = {
  garden: "/jardim",
  catalog: "/explorar",
  room: "/ambiente",
  profile: "/perfil",
};
export function pageForHash(hash) {
  return (
    Object.keys(pagePaths).find((key) => `#${pagePaths[key]}` === hash) ||
    "garden"
  );
}
