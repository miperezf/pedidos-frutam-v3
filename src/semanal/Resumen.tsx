// ── Pedidos semanales · vista Resumen (v56.3) ────────────────────────────────
// Matriz de pallets de la semana con tres cruces:
//   Proveedor × Oficina  → cuánto se compra a cada proveedor y para qué oficina
//   Especie × Oficina    → qué se carga a cada oficina
//   Proveedor × Especie  → qué se compra a cada proveedor
// Al pie: asignado, pedido, contenedores y cuadratura por oficina.
// Cuadratura: un contenedor lleva 21 pallets de manzana o 20 de otra especie y se
// pueden mezclar especies, así que cada oficina suma pallets/capacidad y se mira
// si queda en contenedores enteros. Se calcula sobre el PEDIDO de cada oficina.
import React, { useMemo, useState } from "react";
import { Icon } from "../ui";
import { type Asig, type Mercado, familia, fmt0 } from "./datos";

type Cruce = "provOfi" | "espOfi" | "provEsp";
type Pedido = Record<string, Record<string, number>>;

export const capacidad = (especie: string) => (familia(especie) === "Manzanas" ? 21 : 20);
const f1 = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sumar = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export type Cuadratura = { pallets: number; cont: number; necesarios: number; completos: boolean; faltan: number; sobran: number; cap: number };

/** Cuadratura de una oficina a partir de sus pallets por especie. */
export function cuadrar(porEspecie: Record<string, number>): Cuadratura {
  let pallets = 0, cont = 0, manz = 0;
  for (const [e, v] of Object.entries(porEspecie)) {
    const n = +v || 0; if (n <= 0) continue;
    pallets += n; cont += n / capacidad(e); if (capacidad(e) === 21) manz += n;
  }
  const cap = manz * 2 >= pallets ? 21 : 20;            // capacidad de referencia: la que más pesa
  const resto = cont - Math.floor(cont + 1e-9);
  const faltan = resto > 1e-9 ? Math.round((1 - resto) * cap) : 0;
  const sobran = resto > 1e-9 ? Math.round(resto * cap) : 0;
  const completos = faltan === 0 || sobran === 0;       // queda a menos de medio pallet de un entero
  return { pallets, cont, necesarios: completos ? Math.round(cont) : Math.ceil(cont - 1e-9), completos, faltan: completos ? 0 : faltan, sobran: completos ? 0 : sobran, cap };
}

const CRUCES: { id: Cruce; label: string }[] = [
  { id: "provOfi", label: "Proveedor × Oficina" },
  { id: "espOfi", label: "Especie × Oficina" },
  { id: "provEsp", label: "Proveedor × Especie" },
];

const num = (v: number, fuerte = false) =>
  v ? <span className={fuerte ? "font-bold" : ""}>{fmt0(v)}</span> : <span className="text-subtle">·</span>;

export default function Resumen({ asig, pedido, mks, ordenar }: {
  asig: Asig[]; pedido: Pedido; mks: Mercado[]; ordenar: (a: string[]) => string[];
}) {
  const [cruce, setCruce] = useState<Cruce>("provOfi");
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setAbiertos((a) => ({ ...a, [k]: !a[k] }));

  const D = useMemo(() => {
    const A = asig.filter((a) => +a.cajas > 0);
    const val = (f: (a: Asig) => boolean) => sumar(A.filter(f).map((a) => +a.cajas));
    // Oficinas: las del catálogo + las que aparezcan en el pedido o en asignaciones
    const codes = [...mks.map((m) => m.code)];
    for (const e of Object.keys(pedido)) for (const m of Object.keys(pedido[e] || {})) if (+pedido[e][m] > 0 && !codes.includes(m)) codes.push(m);
    for (const a of A) if (!codes.includes(a.mercado)) codes.push(a.mercado);
    const pedOfi = (m: string) => { const r: Record<string, number> = {}; for (const e of Object.keys(pedido)) if (+pedido[e]?.[m] > 0) r[e] = +pedido[e][m]; return r; };
    const cuad = Object.fromEntries(codes.map((m) => [m, cuadrar(pedOfi(m))]));
    const asgTot = sumar(A.map((a) => +a.cajas));
    const pedTot = sumar(codes.map((m) => cuad[m].pallets));
    const provs = [...new Set(A.map((a) => a.proveedor))]
      .map((n) => ({ n, t: val((a) => a.proveedor === n) })).sort((a, b) => b.t - a.t || a.n.localeCompare(b.n));
    const esps = ordenar([...Object.keys(pedido).filter((e) => Object.values(pedido[e] || {}).some((v) => +v > 0)), ...A.map((a) => a.especie)]);
    return { A, val, codes, cuad, asgTot, pedTot, provs, esps };
  }, [asig, pedido, mks, ordenar]);

  const { A, val, codes, cuad, asgTot, pedTot, provs, esps } = D;
  const nombreOfi = (c: string) => mks.find((m) => m.code === c)?.nombre || c;
  const usadas = codes.filter((m) => cuad[m].pallets > 0 || val((a) => a.mercado === m) > 0);
  const contTot = sumar(usadas.map((m) => cuad[m].cont));
  const porCuadrar = usadas.filter((m) => cuad[m].pallets > 0 && !cuad[m].completos).length;

  if (!pedTot && !asgTot) return (
    <section className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <p className="text-base font-semibold text-fg">Sin pedido ni asignaciones esta semana.</p>
      <p className="mt-1 text-sm text-muted">Ingresa el pedido en la vista Por especie.</p>
    </section>
  );

  const th = "px-2 py-2 text-right";
  const cab = (primera: string, cols: { k: string; label: string; title?: string }[], conPct: boolean) => (
    <thead>
      <tr className="bg-thead text-[11px] font-semibold tracking-wide text-thead-fg uppercase">
        <th scope="col" className="sticky left-0 z-10 w-52 bg-thead px-3 py-2 text-left">{primera}</th>
        {cols.map((c) => <th key={c.k} scope="col" title={c.title} className={th}>{c.label}</th>)}
        <th scope="col" className={`${th} w-20`}>Total</th>
        {conPct && <th scope="col" className={`${th} w-14 pr-3`}>%</th>}
      </tr>
    </thead>
  );
  const ofiCols = usadas.map((m) => ({ k: m, label: m, title: nombreOfi(m) }));
  const celdaPrimera = (contenido: React.ReactNode, sub = false, zebra = "") =>
    <td className={`sticky left-0 z-[1] px-3 py-1.5 text-left ${sub ? "pl-9 text-xs text-muted" : ""} ${zebra}`}>{contenido}</td>;
  const fila = (key: string, i: number, label: string, vals: number[], total: number, opts: { pct?: number; abrible?: boolean; sub?: boolean } = {}) => {
    const zebra = opts.sub ? "bg-surface" : i % 2 ? "bg-surface-2" : "bg-surface";
    return (
      <tr key={key} className={`border-t border-line ${zebra} ${opts.sub ? "text-xs text-muted" : ""}`}>
        {celdaPrimera(opts.abrible ? (
          <button type="button" onClick={() => toggle(key)} aria-expanded={!!abiertos[key]}
            className="inline-flex max-w-full items-center gap-1.5 font-semibold text-fg hover:text-primary">
            <Icon name={abiertos[key] ? "chevronDown" : "chevronRight"} className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            <span className="truncate">{label}</span>
          </button>
        ) : <span className={opts.sub ? "" : "font-semibold text-fg"}>{label}</span>, opts.sub, zebra)}
        {vals.map((v, j) => <td key={j} className="px-2 py-1.5 text-right tabular-nums">{opts.sub ? (v ? fmt0(v) : "") : num(v)}</td>)}
        <td className="px-2 py-1.5 text-right tabular-nums">{opts.sub ? fmt0(total) : num(total, true)}</td>
        {opts.pct !== undefined && <td className="px-2 py-1.5 pr-3 text-right text-muted tabular-nums">{opts.pct ? `${Math.round(opts.pct)}%` : ""}</td>}
      </tr>
    );
  };

  // Pie por oficina: asignado, pedido, contenedores, cuadratura
  const pieOficinas = (conPct: boolean) => {
    const vacio = conPct ? <td /> : null;
    const asgOfi = usadas.map((m) => val((a) => a.mercado === m));
    return (
      <tfoot>
        <tr className="border-t-2 border-line-strong bg-surface-3 font-bold">
          {celdaPrimera("Total asignado", false, "bg-surface-3")}
          {asgOfi.map((v, j) => {
            const p = cuad[usadas[j]].pallets;
            return <td key={j} className={`px-2 py-1.5 text-right tabular-nums ${v < p ? "text-warning" : v > p ? "text-danger" : ""}`} title={v !== p ? `Pedido ${fmt0(p)} · ${v < p ? `faltan ${fmt0(p - v)}` : `${fmt0(v - p)} de más`}` : undefined}>{num(v, true)}</td>;
          })}
          <td className={`px-2 py-1.5 text-right tabular-nums ${asgTot < pedTot ? "text-warning" : ""}`}>{fmt0(asgTot)}</td>{vacio}
        </tr>
        <tr className="border-t border-line bg-surface-3 font-bold">
          {celdaPrimera("Pedido", false, "bg-surface-3")}
          {usadas.map((m) => <td key={m} className="px-2 py-1.5 text-right tabular-nums">{num(cuad[m].pallets, true)}</td>)}
          <td className="px-2 py-1.5 text-right tabular-nums">{fmt0(pedTot)}</td>{vacio}
        </tr>
        <tr className="border-t border-line bg-surface">
          {celdaPrimera(<span className="font-bold text-fg">Contenedores</span>, false, "bg-surface")}
          {usadas.map((m) => <td key={m} className="px-2 py-1.5 text-right font-bold tabular-nums">{cuad[m].pallets ? f1(cuad[m].cont) : <span className="text-subtle">·</span>}</td>)}
          <td className="px-2 py-1.5 text-right font-bold tabular-nums">{f1(contTot)}</td>{vacio}
        </tr>
        <tr className="border-t border-line bg-surface">
          {celdaPrimera(<span className="font-bold text-fg">Cuadratura</span>, false, "bg-surface")}
          {usadas.map((m) => {
            const q = cuad[m];
            if (!q.pallets) return <td key={m} />;
            return (
              <td key={m} className="px-1.5 py-1.5 text-right">
                {q.completos ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success" title={`${q.necesarios} contenedores completos`}>
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />{q.necesarios}
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning"
                    title={`${f1(q.cont)} contenedores: al último le faltan ${q.faltan} pallets para llenarse (o sobran ${q.sobran} para cerrar en ${q.necesarios - 1}). Contenedor de ${q.cap} pallets.`}>
                    faltan {q.faltan}
                  </span>
                )}
              </td>
            );
          })}
          <td className="px-2 py-1.5 text-right">
            {porCuadrar ? <span className="text-xs font-semibold whitespace-nowrap text-warning">{porCuadrar} por cuadrar</span>
              : <span className="text-xs font-semibold text-success">Todo cuadra</span>}
          </td>{vacio}
        </tr>
      </tfoot>
    );
  };

  let tabla: React.ReactNode;
  if (cruce === "provOfi") {
    tabla = (
      <table className="w-full min-w-[720px] text-sm">
        {cab("Proveedor", ofiCols, true)}
        <tbody>
          {provs.length === 0 && <tr><td colSpan={usadas.length + 3} className="px-3 py-6 text-center text-sm text-muted">Sin proveedores asignados todavía.</td></tr>}
          {provs.flatMap((p, i) => {
            const k = `p:${p.n}`;
            const rows = [fila(k, i, p.n, usadas.map((m) => val((a) => a.proveedor === p.n && a.mercado === m)), p.t, { pct: asgTot ? (p.t / asgTot) * 100 : 0, abrible: true })];
            if (abiertos[k]) for (const e of ordenar(A.filter((a) => a.proveedor === p.n).map((a) => a.especie)))
              rows.push(fila(`${k}|${e}`, i, e, usadas.map((m) => val((a) => a.proveedor === p.n && a.especie === e && a.mercado === m)), val((a) => a.proveedor === p.n && a.especie === e), { sub: true, pct: 0 }));
            return rows;
          })}
        </tbody>
        {pieOficinas(true)}
      </table>
    );
  } else if (cruce === "espOfi") {
    tabla = (
      <table className="w-full min-w-[720px] text-sm">
        {cab("Especie (pedido)", ofiCols, true)}
        <tbody>
          {esps.flatMap((e, i) => {
            const k = `e:${e}`; const ped = usadas.map((m) => +pedido[e]?.[m] || 0); const t = sumar(ped);
            const rows = [fila(k, i, e, ped, t, { pct: pedTot ? (t / pedTot) * 100 : 0, abrible: true })];
            if (abiertos[k]) {
              const ps = [...new Set(A.filter((a) => a.especie === e).map((a) => a.proveedor))].sort((a, b) => a.localeCompare(b));
              for (const n of ps) rows.push(fila(`${k}|${n}`, i, n, usadas.map((m) => val((a) => a.especie === e && a.proveedor === n && a.mercado === m)), val((a) => a.especie === e && a.proveedor === n), { sub: true, pct: 0 }));
              if (!ps.length) rows.push(<tr key={`${k}|-`} className="border-t border-line bg-surface"><td colSpan={usadas.length + 3} className="px-3 py-1.5 pl-9 text-xs text-warning">Sin proveedor asignado</td></tr>);
            }
            return rows;
          })}
        </tbody>
        {pieOficinas(true)}
      </table>
    );
  } else {
    const espCols = ordenar(A.map((a) => a.especie));
    tabla = (
      <table className="w-full text-sm" style={{ minWidth: 320 + espCols.length * 90 }}>
        {cab("Proveedor", espCols.map((e) => ({ k: e, label: e })), true)}
        <tbody>
          {provs.length === 0 && <tr><td colSpan={espCols.length + 3} className="px-3 py-6 text-center text-sm text-muted">Sin proveedores asignados todavía.</td></tr>}
          {provs.map((p, i) => fila(`pe:${p.n}`, i, p.n, espCols.map((e) => val((a) => a.proveedor === p.n && a.especie === e)), p.t, { pct: asgTot ? (p.t / asgTot) * 100 : 0 }))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong bg-surface-3 font-bold">
            {celdaPrimera("Total asignado", false, "bg-surface-3")}
            {espCols.map((e) => <td key={e} className="px-2 py-1.5 text-right tabular-nums">{fmt0(val((a) => a.especie === e))}</td>)}
            <td className="px-2 py-1.5 text-right tabular-nums">{fmt0(asgTot)}</td><td />
          </tr>
          <tr className="border-t border-line bg-surface-3 font-bold">
            {celdaPrimera("Pedido", false, "bg-surface-3")}
            {espCols.map((e) => <td key={e} className="px-2 py-1.5 text-right tabular-nums">{fmt0(sumar(Object.values(pedido[e] || {}).map((v) => +v || 0)))}</td>)}
            <td className="px-2 py-1.5 text-right tabular-nums">{fmt0(pedTot)}</td><td />
          </tr>
        </tfoot>
      </table>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cruce">
          {CRUCES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCruce(c.id)} aria-pressed={cruce === c.id}
              className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition-colors ${cruce === c.id ? "border-primary bg-primary text-primary-fg" : "border-line-strong bg-surface text-fg-2 hover:bg-surface-2"}`}>
              {c.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">
          Pallets · contenedor de 21 (manzanas) o 20 (otras){cruce !== "provEsp" ? " · clic en una fila para ver el detalle" : ""}
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-xs">{tabla}</div>
    </>
  );
}
