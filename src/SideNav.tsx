// ── Menú de secciones (v56.1) ────────────────────────────────────────────────
// Botón ☰ en la barra superior → panel desde la izquierda (igual en escritorio y
// móvil). Para sumar una sección: agregarla a SECCIONES y renderizarla en App.tsx.
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

export function MenuSecciones({ open, onClose, activa, onChange }: {
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
