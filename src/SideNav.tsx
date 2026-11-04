// ── Menú lateral (v56.0) ─────────────────────────────────────────────────────
// Escritorio: riel plegable (solo íconos ↔ íconos + nombre); el botón para plegar va
// arriba para que siempre esté a la vista. La preferencia se recuerda por equipo.
// Móvil: panel que se abre desde la izquierda con el botón ☰ de la barra superior.
// Para sumar una sección: agregarla a SECCIONES y renderizarla en App.tsx.
import { Icon, Modal } from "./ui";

export type SeccionId = "pedidos" | "semanal";
export type Seccion = { id: SeccionId; label: string; icon: string; desc: string };

export const SECCIONES: Seccion[] = [
  { id: "pedidos", label: "Pedidos por Mail ID", icon: "newMail", desc: "Armar y enviar pedidos por correo" },
  { id: "semanal", label: "Pedidos semanales", icon: "table", desc: "Pedido por mercado y asignación a proveedores" },
];

/** Sección según la dirección (#/semanal). Sin hash = Pedidos por Mail ID. */
export const seccionDesdeHash = (): SeccionId => (window.location.hash.replace(/^#\/?/, "") === "semanal" ? "semanal" : "pedidos");
export const hashDeSeccion = (id: SeccionId) => (id === "pedidos" ? "#/" : `#/${id}`);

function Item({ s, activa, plegado, onClick }: { s: Seccion; activa: boolean; plegado: boolean; onClick: () => void }) {
  return (
    <a
      href={hashDeSeccion(s.id)}
      onClick={(e) => { e.preventDefault(); onClick(); }}
      aria-current={activa ? "page" : undefined}
      title={plegado ? s.label : s.desc}
      className={`flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-semibold transition-colors ${
        activa ? "bg-primary-soft text-primary" : "text-fg-2 hover:bg-surface-3 hover:text-fg"
      }`}
    >
      <Icon name={s.icon} className="h-5 w-5 shrink-0" />
      <span className={plegado ? "sr-only" : "truncate"}>{s.label}</span>
    </a>
  );
}

export function SideNav({ activa, onChange, plegado, onTogglePlegado }: {
  activa: SeccionId; onChange: (id: SeccionId) => void; plegado: boolean; onTogglePlegado: () => void;
}) {
  return (
    <nav
      aria-label="Secciones"
      className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex ${plegado ? "w-14" : "w-60"}`}
    >
      <div className="border-b border-line p-2">
        <button
          type="button"
          onClick={onTogglePlegado}
          aria-label={plegado ? "Expandir menú" : "Contraer menú"}
          title={plegado ? "Expandir menú" : "Contraer menú"}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-fg"
        >
          <Icon name={plegado ? "chevronDoubleRight" : "chevronDoubleLeft"} className="h-5 w-5 shrink-0" />
          {!plegado && <span>Contraer menú</span>}
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        {SECCIONES.map((s) => <Item key={s.id} s={s} activa={activa === s.id} plegado={plegado} onClick={() => onChange(s.id)} />)}
      </div>
    </nav>
  );
}

export function SideNavMovil({ open, onClose, activa, onChange }: {
  open: boolean; onClose: () => void; activa: SeccionId; onChange: (id: SeccionId) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Menú" icon="menu" drawer side="left">
      <nav aria-label="Secciones" className="-mx-2 flex flex-col gap-1">
        {SECCIONES.map((s) => (
          <a
            key={s.id}
            href={hashDeSeccion(s.id)}
            onClick={(e) => { e.preventDefault(); onChange(s.id); onClose(); }}
            aria-current={activa === s.id ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${activa === s.id ? "bg-primary-soft text-primary" : "text-fg-2 hover:bg-surface-3"}`}
          >
            <Icon name={s.icon} className="h-5 w-5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{s.label}</span>
              <span className="block text-xs text-muted">{s.desc}</span>
            </span>
          </a>
        ))}
      </nav>
    </Modal>
  );
}
