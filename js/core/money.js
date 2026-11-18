// Importes: enteros en pesos argentinos. Solo se formatean al mostrar.
const FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Devuelve "$14.000". Lanza si el valor no es un entero válido. */
export function formatARS(amount) {
  if (!Number.isSafeInteger(amount)) throw new TypeError('Importe inválido: ' + amount);
  // Intl agrega un espacio duro entre "$" y el número en es-AR; el manual usa "$14.000".
  return FORMATTER.format(amount).replace(/\s/g, '');
}

export function isValidPrice(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
}
