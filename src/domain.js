export function dayKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function dueDays(plant, now = new Date()) {
 const start = plant.lastWatered || plant.acquired;
 const a = new Date(`${start}T12:00:00`); const b = new Date(`${dayKey(now)}T12:00:00`);
 return Number(plant.interval) - Math.round((b-a)/86400000);
}
export function validateBackup(data) {
 if (!data || data.version !== 1 || !Array.isArray(data.plants)) throw new Error('Arquivo de backup inválido.');
 if (data.plants.length > 1000) throw new Error('O backup excede o limite de 1.000 plantas.');
 const ids=new Set();
 for (const p of data.plants) {
  if (!p || typeof p.id!=='string' || ids.has(p.id) || typeof p.name!=='string' || !p.name.trim() || typeof p.species!=='string' || !Number.isInteger(p.interval) || p.interval<1 || p.interval>365 || !validDate(p.acquired) || (p.lastWatered && !validDate(p.lastWatered)) || !Array.isArray(p.history) || p.history.some(h=>!h || !validDate(h.date) || typeof h.type!=='string') || (p.photo && (typeof p.photo!=='string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p.photo)))) throw new Error('O backup contém uma planta com dados inválidos.');
  ids.add(p.id);
 }
 return data.plants;
}
function validDate(d) { return typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(d+'T12:00:00').valueOf()); }
export function recommend(plants,{light,pets,region}) { return plants.filter(p=>light!=='nenhuma' && p.regions.includes(region) && (!pets || p.pets) && (light==='baixa'?p.light==='baixa':light==='sol'?p.light==='sol':p.light!=='sol')); }
