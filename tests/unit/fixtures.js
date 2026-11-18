import { readFileSync } from 'node:fs';

const load = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

/**
 * Datos FIJOS de prueba: la carta del manual (precios 17/11/2026) y un negocio con todo pendiente.
 * Así los casos de cálculo no cambian cuando el negocio actualiza precios en data/.
 */
export const catalog = () => load('./catalogo-fixture.json');
export const business = () => load('./negocio-fixture.json');

/** Datos vivos del proyecto (lo que se publica). */
export const liveCatalog = () => load('../../data/catalogo.json');
export const liveBusiness = () => load('../../data/negocio.json');

/**
 * Negocio de PRUEBA con datos confirmados ficticios.
 * La tarifa de $1.500 y el número existen solo en tests: no son datos del negocio.
 */
export function businessConfirmedFixture() {
  const b = business();
  b.whatsapp = { estado: 'confirmado', numero: '5490000000000' };
  b.modalidades = {
    retiro: { estado: 'confirmado' },
    envio: {
      estado: 'confirmado',
      zonas: [
        { id: 'zona-test', nombre: 'Zona de prueba', tarifa: 1500, tarifaEstado: 'confirmada' },
        { id: 'zona-gratis', nombre: 'Zona sin cargo', tarifa: 0, tarifaEstado: 'confirmada' },
        { id: 'zona-pendiente', nombre: 'Zona a cotizar', tarifa: null, tarifaEstado: 'pendiente' },
      ],
    },
  };
  return b;
}

export class MemoryStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

export class BlockedStorage {
  getItem() { throw new Error('SecurityError'); }
  setItem() { throw new Error('QuotaExceededError'); }
  removeItem() { throw new Error('SecurityError'); }
}
