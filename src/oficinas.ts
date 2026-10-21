// ── Oficinas para compras DIRECTAS (Consignee & Notify) ─────────────────────
// Para agregar una oficina, sumar un objeto a OFICINAS. Campos:
//   pais    → como se escribe en el campo País (sin importar tildes/mayúsculas)
//   puerto  → solo si el país tiene más de una oficina (ej. Costa Rica por puerto)
//   nombre  → texto que va en Exporta: "[PROVEEDOR] DIRECTO A [nombre]"
//   direccion, idTipo (ej. "RUC", "CÉDULA JURÍDICA"), idNumero, contacto, correo, telefono
//            → datos del bloque CONSIGNEE & NOTIFY (los vacíos se omiten)
//
// El estado "Directo" se guarda en el propio campo Exporta (no requiere campos
// nuevos en Firestore): si Exporta termina en " DIRECTO A <etiqueta>", el pedido
// es directo a esa oficina.

export type Oficina = {
  id: string;
  pais: string;
  puerto?: string;
  nombre: string;
  direccion: string;
  idTipo?: string; // rótulo del identificador tributario (por defecto "RUC")
  idNumero?: string;
  contacto?: string;
  correo?: string;
  telefono?: string;
};

export const OFICINAS: Oficina[] = [
  {
    id: "EC",
    pais: "ECUADOR",
    nombre: "VPCEC S.A.",
    direccion: "KM 6 VIA DURAN BOLICHE DURAN 092411, GUAYAQUIL- ECUADOR.",
    idTipo: "RUC",
    idNumero: "0990699119001",
    contacto: "KENIA BALLADARES",
    correo: "kballadares@vpcom.com",
    telefono: "593-95-9556958",
  },
  // Pendiente: resto de oficinas (Costa Rica, una por puerto, con "puerto").
];

/** Datos de la oficina como pares [rótulo, valor], sin los vacíos.
 *  Orden de la ficha (una columna, hacia abajo). */
export const datosOficina = (o: Oficina): [string, string][] =>
  ([
    ["Dirección", o.direccion],
    [o.idTipo || "RUC", o.idNumero],
    ["Contacto", o.contacto],
    ["Correo", o.correo],
    ["Teléfono", o.telefono],
  ] as [string, string | undefined][])
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(([k, v]) => [k, String(v).trim()]);

/** Normaliza para comparar países: sin tildes, mayúsculas, espacios simples. */
export const normalizarTexto = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

export const oficinasDePais = (pais: unknown, lista: Oficina[] = OFICINAS): Oficina[] => {
  const p = normalizarTexto(pais);
  return p ? lista.filter((o) => normalizarTexto(o.pais) === p) : [];
};

/** Texto de la oficina en Exporta. Si el país tiene varias, se agrega el puerto. */
export const etiquetaOficina = (o: Oficina, lista: Oficina[] = OFICINAS): string => {
  const variasEnPais = oficinasDePais(o.pais, lista).length > 1;
  return variasEnPais && o.puerto ? `${o.nombre} (${o.puerto.toUpperCase()})` : o.nombre;
};

export const SEPARADOR_DIRECTO = " DIRECTO A ";

export const exportaDirecto = (proveedor: unknown, o: Oficina, lista: Oficina[] = OFICINAS): string =>
  `${String(proveedor ?? "").trim().toUpperCase()}${SEPARADOR_DIRECTO}${etiquetaOficina(o, lista)}`;

/** Devuelve la oficina si Exporta indica una compra directa; si no, null. */
export const detectarDirecto = (exporta: unknown, lista: Oficina[] = OFICINAS): Oficina | null => {
  const e = normalizarTexto(exporta);
  if (!e.includes(SEPARADOR_DIRECTO.trim())) return null;
  return lista.find((o) => e.endsWith(normalizarTexto(SEPARADOR_DIRECTO + etiquetaOficina(o, lista)))) || null;
};
