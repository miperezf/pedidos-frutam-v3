import React, { useState, useEffect, useRef } from "react";
import { Icon, Spinner, Button, IconButton, Badge, Modal, useConfirm, useToasts } from "./ui";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── VERSIÓN DE LA APP ────────────────────────────────────────────────────────
// APP_VERSION es la versión que se muestra en el footer: súbela en cada release.
// WHATSNEW_VERSION controla el modal de novedades de forma independiente: solo
// cámbiala cuando actualices el contenido del modal (así no reaparece con un
// texto antiguo en releases que son solo correcciones). Lectura y escritura
// usan la misma clave (WHATSNEW_KEY).
//
// Historial de versiones (v51.x = correcciones sobre v51):
//  v51.1 header de pedidos sent no activos se persiste al reenviar
//  v51.2 reset de ref de búsqueda y presencia tras enviar
//  v51.3 ref de País (navegación con flechas) y lista de variedades para MANZANA/MANZANAS
//  v51.4 acciones de fila respetan el modo sent (no escriben header en caliente)
//  v51.5 escape del Mail ID en el HTML del correo/preview y iframe del preview en sandbox
//  v51.6 fondo translúcido de modales (Tailwind v4), detector de versión operativo,
//        parser tolerante en envío/preview, localStorage seguro, limpieza de restos
//  v51.7 ruta base según el repositorio y aviso visible de entorno de pruebas
//  v52.0 nueva interfaz (tokens claro/oscuro, pestañas, barra de acciones),
//        avisos de guardado/error, anti doble clic, confirmaciones propias,
//        flechas respetan el cursor, reordenar en móvil, Mail ID validado
//  v52.1 navegador de pedidos (hasta 15+), cabecera de tabla contrastada, íconos
//        con color y leyenda, FOB/FOT separado, sin "+" ambiguos, diagnóstico
//        de conexión visible y tiempo máximo de 15 s por escritura
//  v52.2 observación solo en la 1ª fila (por pedido), total de pallets en negrita a
//        la derecha, ayuda de acciones en botón (i), "Agregar fila" visible bajo la
//        tabla, tabla con margen dentro de la tarjeta, sin textos de relleno
//  v52.3 tabla compacta (filas más bajas, huincha de total delgada), "+" verde para
//        duplicar, sin botón "Agregar fila", cabecera Acciones centrada
//  v52.4 fila cancelada roja y tachada también en campos vacíos (como la original),
//        sin subtítulo, se elimina "Nuevo mail" (duplicaba a "Limpiar búsqueda"),
//        "Limpiar búsqueda" pide confirmación si va a descartar un borrador con datos
//  v52.5 menú de perfil (círculo con estado de conexión) que agrupa historial,
//        novedades, tema, cliente de correo, conexión y recarga; columnas centradas
//  v52.6 el menú de perfil se abre en el espacio libre a la derecha (borde de pantalla)
//  v52.7 el menú sale del círculo de perfil hacia la derecha (sin tapar campos);
//        historial como reloj circular con la cantidad de envíos
const APP_VERSION = "v52.7";
const APP_VERSION_DATE = "21 Oct 2026";
const WHATSNEW_VERSION = "v52";
const WHATSNEW_KEY = `frutam_whatsnew_${WHATSNEW_VERSION}`;
// v51.7: etiqueta de entorno inyectada por vite.config.ts ("" en producción)
const ENV_LABEL = typeof __ENV_LABEL__ !== "undefined" ? __ENV_LABEL__ : "";

const InputField = React.forwardRef(
  (
    {
      label,
      name,
      value,
      onChange,
      onBlur,
      onFocus,
      placeholder = "",
      className = "",
      type = "text",
      list,
      readOnly = false,
      title,
    },
    ref
  ) => {
    const safeValue =
      value === null || value === undefined ? "" : String(value);
    return (
      <div className="w-full min-w-0">
        <label htmlFor={name} className="label">
          {label}
        </label>
        <input
          type={type}
          id={name}
          name={name}
          value={safeValue}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`field ${className}`}
          ref={ref}
          list={list}
          readOnly={readOnly}
          title={title}
          autoComplete="off"
        />
      </div>
    );
  }
);

// v52: celda editable. variant="field" para las tarjetas móviles.
const TableInput = React.forwardRef(
  (
    {
      name,
      value,
      onChange,
      onBlur,
      onFocus,
      type = "text",
      placeholder = "",
      readOnly = false,
      isCanceledProp = false,
      list,
      inputMode,
      ariaLabel,
      variant = "cell",
    },
    ref
  ) => {
    const safeValue =
      value === null || value === undefined ? "" : String(value);
    return (
      <input
        type={type}
        name={name}
        value={safeValue}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode={inputMode}
        min={type === "number" ? 0 : undefined}
        className={`${variant === "field" ? "field py-1.5" : "cell-input"} ${
          isCanceledProp ? "line-through text-danger placeholder:text-danger/60" : ""
        }`}
        ref={ref}
        readOnly={readOnly}
        list={list}
        autoComplete="off"
      />
    );
  }
);

const initialHeaderState = {
  reDestinatarios: "",
  deNombrePais: "",
  nave: "",
  fechaCarga: "",
  exporta: "",
  emailSubject: "",
  mailId: "",
  incoterm: "FOB",
  status: "draft",
  createdAt: null,
  createdBy: null,
  lastModifiedBy: null,
  updatedAt: null,
};

const initialItemState = {
  id: "",  // always overridden with crypto.randomUUID() at call site
  pallets: "",
  especie: "",
  variedad: "",
  formato: "",
  calibre: "",
  categoria: "",
  preciosFOB: "",
  estado: "",
  isCanceled: false,
};

// ── v51.1: campos de header que el usuario puede editar a mano.
// Se usan para persistir ediciones en pedidos "sent" no activos al reenviar.
// No incluye status/createdBy/createdAt/mailId/emailSubject a propósito.
// ── v51.3: la lista de variedades de manzana debe ofrecerse tanto para
// "MANZANA" (singular, el valor normalizado y el placeholder) como "MANZANAS".
const isAppleSpecies = (especie) => {
  const v = especie ? especie.toUpperCase() : "";
  return v === "MANZANA" || v === "MANZANAS";
};

// ── v51.6: localStorage puede lanzar excepción (modo privado, almacenamiento
// bloqueado). Estas funciones nunca rompen el render.
const safeStorageGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const safeStorageSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* sin persistencia */ }
};

const EDITABLE_HEADER_FIELDS = [
  "reDestinatarios",
  "deNombrePais",
  "nave",
  "fechaCarga",
  "exporta",
];

const App = () => {
  const appId = firebaseConfig.projectId;

  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [allOrdersFromFirestore, setAllOrdersFromFirestore] = useState([]);
  const [displayedOrders, setDisplayedOrders] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [committedSearchTerm, setCommittedSearchTerm] = useState("");

  const [activeOrderId, setActiveOrderId] = useState(null);

  // ─── PRESENCE SYSTEM ────────────────────────────────────────────────────────
  const [presenceMailId, setPresenceMailId] = useState(null);
  const [otherUsersPresent, setOtherUsersPresent] = useState([]);
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const [presenceConflictUsers, setPresenceConflictUsers] = useState([]);
  const [pendingSearchTerm, setPendingSearchTerm] = useState("");
  const presenceUnsubscribeRef = useRef(null);

  // ─── FOB/FOT GLOBAL: cola de escrituras y secuencia de selección ─────────────
  const incotermWriteQueueRef = useRef(Promise.resolve());
  const incotermSeqRef = useRef(0);

  // ── v51.1: copia de cada header tal como se cargó desde Firestore (por id).
  // Permite detectar qué campos editó el usuario en pedidos "sent" no activos.
  const loadedHeadersRef = useRef<Record<string, any>>({});

  // ─── HISTORY PANEL ──────────────────────────────────────────────────────────
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // ── FIX: antes se leía "frutam_whatsnew_v50" pero se guardaba
  // "frutam_whatsnew_v51", por lo que el modal aparecía siempre.
  // Ahora ambas operaciones usan la misma constante WHATSNEW_KEY.
  const [showWhatsNew, setShowWhatsNew] = useState(() => {
    return safeStorageGet(WHATSNEW_KEY) !== "seen";
  });
  const [historyResendingId, setHistoryResendingId] = useState(null);

  // ─── ACTUALIZACIÓN DE VERSIÓN ────────────────────────────────────────────────
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // ─── EMAIL CLIENT CONFIG ─────────────────────────────────────────────────────
  const EMAIL_CLIENT_KEY = "frutam_email_client";
  const [emailClientPref, setEmailClientPref] = useState(
    () => safeStorageGet(EMAIL_CLIENT_KEY) || "auto"
  );
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // ─── AUTOCOMPLETADO CONTEXTUAL ──────────────────────────────────────────────
  const [proveedorSuggestion, setProveedorSuggestion] = useState(null);
  const suggestionTimerRef = useRef(null);
  const lookupDebounceRef = useRef(null);
  const suggestionAppliedRef = useRef(""); // stores proveedor name — empty means no suggestion applied yet
  const committedSearchTermRef = useRef("");

  // ─── DARK MODE ───────────────────────────────────────────────────────────────
  const DARK_MODE_KEY = "frutam_dark_mode";
  const [darkMode, setDarkMode] = useState(
    () => safeStorageGet(DARK_MODE_KEY) === "true"
  );
  // v52: el modo oscuro se aplica con la clase "dark" en <html> (tokens CSS)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // v52: avisos, confirmaciones y estados de trabajo en curso
  const [toastsEl, notify] = useToasts();
  const [confirmEl, askConfirm] = useConfirm();
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const lastSaveErrorToastRef = useRef(0);
  const [isSending, setIsSending] = useState(false);
  const sendingRef = useRef(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchingRef = useRef(false);
  const [addingOrder, setAddingOrder] = useState(false);
  const addingOrderRef = useRef(false);
  const [showRowHelp, setShowRowHelp] = useState(false); // v52.2: ayuda de acciones de fila
  // v52.5: Esc cierra el menú de perfil (showConfigPanel = menú abierto)
  // v52.6: el menú se ancla al borde derecho de la ventana (espacio libre) y su
  // altura sigue al círculo de perfil al hacer scroll o cambiar el tamaño.
  // v52.7: el menú sale del círculo y se despliega hacia la derecha, empezando
  // donde termina el contenido (no tapa campos). Si no cabe, se corre lo mínimo
  // necesario para no salir de la pantalla.
  const avatarRef = useRef(null);
  const MENU_WIDTH = 320;
  const [menuLeft, setMenuLeft] = useState(0);
  useEffect(() => {
    if (!showConfigPanel) return;
    const place = () => {
      const r = avatarRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(MENU_WIDTH, window.innerWidth - 24);
      const preferred = r.width + 8; // justo a la derecha del círculo
      const maxLeft = window.innerWidth - 12 - width - r.left; // borde derecho de la ventana
      setMenuLeft(Math.round(Math.min(preferred, maxLeft)));
    };
    place();
    const onKey = (e) => { if (e.key === "Escape") setShowConfigPanel(false); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
    };
  }, [showConfigPanel]);

  // v52.1: diagnóstico de conexión (se muestra en pantalla y en Configuración)
  const [authError, setAuthError] = useState(null); // { code, message }
  const [connError, setConnError] = useState(null); // { code, message, at, op }
  const recordError = (op, error) => {
    const info = {
      op,
      code: error?.code || error?.name || "desconocido",
      message: String(error?.message || error || ""),
      at: Date.now(),
    };
    setConnError(info);
    console.error(`[FRUTAM:${op}]`, info.code, info.message);
  };

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      safeStorageSet(DARK_MODE_KEY, String(!prev));
      return !prev;
    });
  };

  // ─── BUSCAR ÚLTIMO PEDIDO DE PROVEEDOR ───────────────────────────────────────
  const lookupLastOrderForProveedor = async (proveedorName) => {
    const name = (proveedorName || "").trim();

    const nameLower = name.toLowerCase();

    // ── GUARDS ──────────────────────────────────────────────────────────────────
    if (!db || !name) {
      return;
    }
    if (committedSearchTermRef.current) {
      return;
    }
    if (suggestionAppliedRef.current === nameLower) {
      return;
    }
    const currentItems = orderItemsRef.current;
    const hasData = currentItems.some(it => it.especie || it.variedad || it.formato);
    if (hasData) {
      return;
    }

    // ── FIRESTORE QUERY ─────────────────────────────────────────────────────────
    try {
      const snap = await getDocs(query(
        collection(db, `artifacts/${appId}/public/data/pedidos`),
        where("header.status", "==", "sent")
      ));

      const allSent = parseFirestoreOrders(snap.docs);

      // ── FIND MATCHING ORDERS ─────────────────────────────────────────────────
      const matches = allSent
        .filter(o => (o.header?.reDestinatarios || "").toLowerCase() === nameLower)
        .sort((a, b) => (b.header?.updatedAt || 0) - (a.header?.updatedAt || 0));

      if (matches.length === 0) {
        return;
      }

      // ── FIND MOST RECENT ORDER WITH ACTUAL ITEM DATA ─────────────────────────
      let bestOrder = null;
      let bestItems = [];

      for (const order of matches) {
        const raw = Array.isArray(order.items) ? order.items : [];
        const candidates = raw.filter(it => it.especie || it.variedad);
        if (candidates.length > 0) {
          bestOrder = order;
          bestItems = candidates;
          break;
        }
      }

      if (!bestOrder || bestItems.length === 0) {
        return;
      }

      // ── BUILD SUGGESTION ─────────────────────────────────────────────────────
      // Include ALL item fields — pallets and prices included
      const suggestionItems = bestItems.map(it => ({
        especie:    it.especie    || "",
        variedad:   it.variedad   || "",
        formato:    it.formato    || "",
        calibre:    it.calibre    || "",
        categoria:  it.categoria  || "",
        pallets:    it.pallets    || "",
        preciosFOB: it.preciosFOB || "",
      }));

      const suggestion = {
        proveedor:      name,
        nave:           bestOrder.header?.nave          || "",
        deNombrePais:   bestOrder.header?.deNombrePais  || "",
        exporta:        bestOrder.header?.exporta       || "",
        incoterm:       bestOrder.header?.incoterm      || "FOB",
        items:          suggestionItems,
      };

      setProveedorSuggestion(suggestion);
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = setTimeout(() => {
        setProveedorSuggestion(null);
      }, 12000);

    } catch (e) {
    }
  };

    const applyProveedorSuggestion = () => {
    if (!proveedorSuggestion) return;
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);

    // Fill table with all fields — only reset estado and isCanceled
    const newItems = proveedorSuggestion.items.map(it => ({
      id: crypto.randomUUID(),
      especie:    it.especie    || "",
      variedad:   it.variedad   || "",
      formato:    it.formato    || "",
      calibre:    it.calibre    || "",
      categoria:  it.categoria  || "",
      pallets:    it.pallets    || "",
      preciosFOB: it.preciosFOB || "",
      estado:     "",
      isCanceled: false,
    }));
    setOrderItems(newItems);
    orderItemsRef.current = newItems;
    suggestionAppliedRef.current = proveedorSuggestion.proveedor.toLowerCase();
    setProveedorSuggestion(null);
  };

  const dismissProveedorSuggestion = () => {
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    if (proveedorSuggestion) {
      suggestionAppliedRef.current = proveedorSuggestion.proveedor.toLowerCase();
    }
    setProveedorSuggestion(null);
  };

  const saveEmailClientPref = (pref) => {
    safeStorageSet(EMAIL_CLIENT_KEY, pref);
    setEmailClientPref(pref);
  };

  const openEmailClient = (subject) => {
    const outlookWebUrl = `https://outlook.office.com/mail/deeplink/compose?subject=${encodeURIComponent(subject)}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=`;

    if (isMobileDevice()) {
      window.location.href = mailtoUrl;
      return;
    }

    const pref = emailClientPref;

    if (pref === "web") {
      window.open(outlookWebUrl, "_blank");
      return;
    }

    if (pref === "desktop") {
      window.location.href = mailtoUrl;
      return;
    }

    const fallbackTab = window.open("about:blank", "_blank");
    window.location.href = mailtoUrl;

    let desktopOpened = false;
    const onBlur = () => { desktopOpened = true; };
    window.addEventListener("blur", onBlur, { once: true });

    setTimeout(() => {
      window.removeEventListener("blur", onBlur);
      if (desktopOpened) {
        try { fallbackTab?.close(); } catch (_) {}
      } else {
        try {
          if (fallbackTab && !fallbackTab.closed) {
            fallbackTab.location.href = outlookWebUrl;
          }
        } catch (_) {}
      }
    }, 600);
  };

  // ─── DERIVED: last 5 sent Mail IDs for the current user ─────────────────────
  const sentHistory = React.useMemo(() => {
    const sentOrders = allOrdersFromFirestore.filter(
      (o) =>
        o.header?.status === "sent" &&
        o.header?.lastModifiedBy === userId
    );
    const grouped = {};
    sentOrders.forEach((o) => {
      const mid = o.header?.mailId;
      if (!mid) return;
      if (!grouped[mid]) {
        grouped[mid] = { mailId: mid, orders: [], latestUpdatedAt: 0 };
      }
      grouped[mid].orders.push(o);
      if ((o.header?.updatedAt || 0) > grouped[mid].latestUpdatedAt) {
        grouped[mid].latestUpdatedAt = o.header.updatedAt;
      }
    });
    return Object.values(grouped)
      .sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt)
      .slice(0, 5);
  }, [allOrdersFromFirestore, userId]);

  const resendFromHistory = async (mailId) => {
    setHistoryResendingId(mailId);
    try {
      const group = sentHistory.find((g) => g.mailId === mailId);
      if (!group) return;

      const ordersToProcess = [...group.orders].sort(
        (a, b) => (a.header?.createdAt || 0) - (b.header?.createdAt || 0)
      );

      let innerEmailContentHtml = "";
      const allProveedores = new Set();
      const allEspecies = new Set();

      // ── v26: compute the widest card so all cards render at the same width
      const maxWidth = Math.max(...ordersToProcess.map(o => measureOrderWidth(o.header, o.items)));

      ordersToProcess.forEach((order, index) => {
        innerEmailContentHtml += `
            <div style="margin-bottom:8px;margin-left:16px;">
              <h3 style="margin:0 0 6px 0;font-size:16px;color:#2563eb;font-family:Arial,sans-serif;">Pedido #${index + 1}</h3>
            </div>
            ${generateSingleOrderHtml(order.header, order.items, index + 1, maxWidth)}
        `;
        if (order.header.reDestinatarios) allProveedores.add(order.header.reDestinatarios);
        order.items.forEach((item) => { if (item.especie) allEspecies.add(item.especie); });
      });

      const consolidatedSubject = generateEmailSubjectValue(
        Array.from(allProveedores),
        Array.from(allEspecies),
        ""
      );

      const fullEmailBodyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Detalle de Pedido</title>
</head>
<body style="margin:0;padding:16px 16px 16px 16px;background-color:#f8f8f8;font-family:Arial,sans-serif;">
  <div style="width:100%;text-align:right;margin-bottom:12px;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;color:#ef4444;">Mail ID: ${escapeHtml(mailId)}</div>
  <div>
    ${innerEmailContentHtml}
  </div>
</body>
</html>`;

      await copyFormattedContentToClipboard(fullEmailBodyHtml);

      openEmailClient(consolidatedSubject);
      notify("success", "Correo copiado. Pégalo en el cuerpo del mensaje con Ctrl+V.");
    } catch (err) {
      notify("error", "No se pudo preparar el reenvío. Inténtalo de nuevo.");
    } finally {
      setHistoryResendingId(null);
    }
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "justo ahora";
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days} día${days > 1 ? "s" : ""}`;
  };

  // Firebase Initialization and Authentication Effect
  useEffect(() => {
    // ── v22 FIX (memory leak): Previously `return () => unsubscribe()` was
    // inside the async initAuth() function. useEffect ignores return values
    // from async functions (they return Promises, not cleanup functions).
    // The onAuthStateChanged listener was therefore NEVER unsubscribed.
    // Fix: capture the unsubscribe ref outside the async block and return
    // the cleanup directly to useEffect.
    let unsubscribeAuth = null;

    const initAuth = async () => {
      try {
        // Sign in anonymously only if not already authenticated
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (error) {
        // Auth failure — will still attach the listener below
        setAuthError({ code: error?.code || "auth/desconocido", message: String(error?.message || error) });
      }
    };

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthError(null);
        setUserId(user.uid);
        setIsAuthReady(true);
      } else {
        try {
          await signInAnonymously(auth);
          setUserId(auth.currentUser?.uid ?? null);
        } catch (anonError) {
          setAuthError({ code: anonError?.code || "auth/desconocido", message: String(anonError?.message || anonError) });
          setUserId(null);
        } finally {
          setIsAuthReady(true);
        }
      }
    });

    initAuth();

    // This cleanup NOW reaches useEffect correctly
    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  const getCurrentWeekNumber = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return (
      1 +
      Math.round(
        ((date.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7
      )
    );
  };

  const SPECIES_NORMALIZATION_MAP = {
    MANZANA: "MANZANA",
    MANZANAS: "MANZANA",
    MZ: "MANZANA",
    APPLE: "MANZANA",
    APPLES: "MANZANA",
    PERA: "PERA",
    PERAS: "PERA",
    PR: "PERA",
    PEAR: "PERA",
    PEARS: "PERA",
    UVA: "UVA",
    UVAS: "UVA",
    GRAPE: "UVA",
    GRAPES: "UVA",
    UV: "UVA",
    KIWI: "KIWI",
    KIWIS: "KIWI",
    NARANJA: "NARANJA",
    NARANJAS: "NARANJA",
    LIMON: "LIMON",
    LIMONES: "LIMON",
    LM: "LIMON",
    CEREZA: "CEREZA",
    CEREZAS: "CEREZA",
    CLEMENTINA: "CLEMENTINA",
    CLEMENTINAS: "CLEMENTINA",
    CIRUELA: "CIRUELA",
    CIRUELAS: "CIRUELA",
    DURAZNO: "DURAZNO",
    DURAZNOS: "DURAZNO",
    NECTARIN: "NECTARIN",
    NECTARINES: "NECTARIN",
  };

  const normalizeSpeciesName = (name) => {
    if (typeof name !== "string" || name.trim() === "") {
      return "";
    }
    const upperName = name.toUpperCase().trim();
    return SPECIES_NORMALIZATION_MAP[upperName] || upperName;
  };

  const generateEmailSubjectValue = (
    proveedores,
    especies,
    mailGlobalId = ""
  ) => {
    const weekNumber = getCurrentWeekNumber();

    const formatPart = (arr, defaultValue) => {
      const safeArr = Array.isArray(arr) ? arr : [];
      const uniqueValues = Array.from(
        new Set(
          safeArr
            .filter((val) => typeof val === "string" && val.trim() !== "")
            .map((val) => normalizeSpeciesName(val))
        )
      );
      return uniqueValues.length > 0 ? uniqueValues.join("-") : defaultValue;
    };

    const uniqueProveedores = Array.from(
      new Set(Array.isArray(proveedores) ? proveedores : [])
    ).filter((val) => typeof val === "string" && val.trim() !== "");
    const formattedProveedor =
      uniqueProveedores.length > 0
        ? uniqueProveedores[0].toUpperCase().replace(/[^A-Z0-9]/g, "")
        : "PROVEEDOR";

    const formattedEspecie = formatPart(especies, "ESPECIE");

    const subject = `PED–W${weekNumber}–${formattedProveedor}–${formattedEspecie}`;
    return subject;
  };

  // initialHeaderState and initialItemState defined at module level (below)

  const [headerInfo, setHeaderInfo] = useState(() => ({
    ...initialHeaderState,
    emailSubject: generateEmailSubjectValue([], []),
  }));

  const [orderItems, setOrderItems] = useState([{ ...initialItemState, id: crypto.randomUUID() }]);
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [showOrderActionsModal, setShowOrderActionsModal] = useState(false);
  const [previewHtmlContent, setPreviewHtmlContent] = useState("");
  const [isShowingPreview, setIsShowingPreview] = useState(false);
  const [emailActionTriggered, setEmailActionTriggered] = useState(false);

  // ── v22 FIX (setState after unmount): guard all async operations
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── DETECTOR DE NUEVAS VERSIONES ─────────────────────────────────────────────
  // Compara el build id embebido en este bundle (__BUILD_ID__, inyectado por
  // Vite) con /version.json del servidor. Si no coinciden:
  //   • al cargar con un bundle viejo: recarga sola una vez (sin loops)
  //   • con la app en uso: solo muestra un aviso, para no cortar un pedido
  // Si __BUILD_ID__ no existe (p. ej. desarrollo), el efecto no hace nada.
  useEffect(() => {
    if (typeof __BUILD_ID__ === "undefined") return;
    let first = true;

    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) { first = false; return; }
        const { version } = await res.json();
        if (version === __BUILD_ID__) { first = false; return; }

        if (first && sessionStorage.getItem("frutam_reloaded") !== version) {
          sessionStorage.setItem("frutam_reloaded", version);
          window.location.reload();
          return;
        }
        if (isMountedRef.current) setUpdateAvailable(true);
      } catch {}
      first = false;
    };

    check();
    const id = setInterval(check, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const [showObservationModal, setShowObservationModal] = useState(false);
  const [currentEditingItemData, setCurrentEditingItemData] = useState(null);
  const [modalObservationText, setModalObservationText] = useState("");
  const observationTextareaRef = useRef(null);

  const headerInputRefs = useRef({});
  const tableInputRefs = useRef({});
  const isUserEditing = useRef(false);
  const pendingSaveTimeout = useRef(null);
  const orderItemsRef = useRef([]);
  orderItemsRef.current = orderItems;
  // ── v20: headerInfo also needs a ref — it has the same stale-closure risk
  // as orderItems. Any action function that fires synchronously after a blur
  // must read from this ref instead of the closure value.
  const headerInfoRef = useRef(headerInfo);
  headerInfoRef.current = headerInfo;
  const activeOrderIdRef = useRef(null);
  activeOrderIdRef.current = activeOrderId;

  // ─── DRAG & DROP REFS ────────────────────────────────────────────────────────
  const dragItemIndex = useRef(null);
  const dragOverIndex = useRef(null);

  const headerInputOrder = [
    "reDestinatarios",
    "deNombrePais",
    "nave",
    "fechaCarga",
    "exporta",
    "emailSubject",
  ];
  const tableColumnOrder = [
    "pallets",
    "especie",
    "variedad",
    "formato",
    "calibre",
    "categoria",
    "preciosFOB",
  ];

  // v52: envoltorio con indicador "Guardando… / Guardado" y aviso si falla.
  // Sigue relanzando el error para que los llamadores mantengan su flujo.
  const saveOrderToFirestore = async (orderToSave) => {
    if (!db || !userId) return;
    if (orderToSave.rowAction && !orderToSave.id) return;
    setSaveState("saving");
    try {
      // v52.1: si el servidor no confirma en 15 s, se informa (antes quedaba colgado)
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error("El servidor no confirmó el guardado en 15 s.");
          e.code = "timeout";
          reject(e);
        }, 15000);
      });
      try {
        await Promise.race([saveOrderToFirestoreRaw(orderToSave), timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (isMountedRef.current) {
        setSaveState("saved");
        setConnError(null);
      }
    } catch (error) {
      recordError("GUARDAR", error);
      if (isMountedRef.current) setSaveState("error");
      if (Date.now() - lastSaveErrorToastRef.current > 8000) {
        lastSaveErrorToastRef.current = Date.now();
        notify("error", "No se pudieron guardar los últimos cambios. Revisa tu conexión e inténtalo de nuevo.");
      }
      throw error;
    }
  };

  const saveOrderToFirestoreRaw = async (orderToSave) => {
    if (!db || !userId) {
      return;
    }
    try {
      const ordersCollectionRef = collection(
        db,
        `artifacts/${appId}/public/data/pedidos`
      );
      const { header, items } = orderToSave;
      // ── v51.4: las acciones de fila (agregar/eliminar/reordenar/cancelar/observación)
      // llaman aquí con rowAction. Sin pedido activo no hay nada que guardar (antes se
      // generaba un id nuevo y updateDoc fallaba). Y si el pedido activo es un "sent"
      // recuperado por Mail ID, solo se guardan los items: el header se persiste al
      // enviar (SENT MODE GUARD), no en caliente con valores a medio editar.
      if (orderToSave.rowAction && !orderToSave.id) return;
      const itemsOnly =
        !!orderToSave.rowAction &&
        !!committedSearchTermRef.current &&
        header?.status === "sent";
      const orderDocId = orderToSave.id || doc(ordersCollectionRef).id;
      const orderDocRef = doc(ordersCollectionRef, orderDocId);

      if (orderToSave.isNew) {
        await setDoc(orderDocRef, {
          header: {
            ...header,
            lastModifiedBy: userId,
            updatedAt: Date.now(),
          },
          items: JSON.stringify(items),
        });
      } else {
        const updatePayload = { items: JSON.stringify(items) };
        const skipFields = new Set(["createdBy", "createdAt"]);
        if (!itemsOnly) {
          Object.entries(header).forEach(([key, value]) => {
            if (!skipFields.has(key)) {
              updatePayload[`header.${key}`] = value;
            }
          });
        }
        updatePayload["header.lastModifiedBy"] = userId;
        updatePayload["header.updatedAt"] = Date.now();
        await updateDoc(orderDocRef, updatePayload);
      }
    } catch (error) {
      throw error;
    }
  };

  const handleSoftDeleteOrderInFirestore = async (orderDocIdToDelete) => {
    if (!db || !userId) {
      return;
    }
    try {
      const orderDocRef = doc(
        db,
        `artifacts/${appId}/public/data/pedidos`,
        orderDocIdToDelete
      );
      await updateDoc(orderDocRef, {
        "header.status": "deleted",
        "header.lastModifiedBy": userId,
        "header.updatedAt": Date.now(),
      });
    } catch (error) {
    }
  };

  // ─── PRESENCE HELPERS ───────────────────────────────────────────────────────

  const writePresence = async (mailId) => {
    if (!db || !userId || !mailId) return;
    try {
      const presenceRef = doc(
        db,
        `artifacts/${appId}/public/data/presence/${mailId}/users/${userId}`
      );
      await setDoc(presenceRef, {
        userId,
        openedAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
    } catch (error) {
    }
  };

  const clearPresence = async (mailId) => {
    if (!db || !userId || !mailId) return;
    try {
      const presenceRef = doc(
        db,
        `artifacts/${appId}/public/data/presence/${mailId}/users/${userId}`
      );
      await deleteDoc(presenceRef);
    } catch (error) {
    }
  };

  const subscribeToPresence = (mailId) => {
    if (presenceUnsubscribeRef.current) {
      presenceUnsubscribeRef.current();
      presenceUnsubscribeRef.current = null;
    }
    if (!db || !mailId) return;

    const presenceCollectionRef = collection(
      db,
      `artifacts/${appId}/public/data/presence/${mailId}/users`
    );

    const unsubscribe = onSnapshot(presenceCollectionRef, (snapshot) => {
      const now = Date.now();
      const others = snapshot.docs
        .map((d) => d.data())
        .filter(
          (p) =>
            p.userId !== userId &&
            p.expiresAt > now
        )
        .map((p) => p.userId.substring(0, 8).toUpperCase());

      setOtherUsersPresent(others);
    });

    presenceUnsubscribeRef.current = unsubscribe;
  };

  const checkPresenceConflict = async (mailId) => {
    if (!db || !mailId) return [];
    try {
      const presenceCollectionRef = collection(
        db,
        `artifacts/${appId}/public/data/presence/${mailId}/users`
      );
      const snapshot = await getDocs(presenceCollectionRef);
      const now = Date.now();
      const others = snapshot.docs
        .map((d) => d.data())
        .filter((p) => p.userId !== userId && p.expiresAt > now)
        .map((p) => p.userId.substring(0, 8).toUpperCase());
      return others;
    } catch (error) {
      return [];
    }
  };

  useEffect(() => {
    if (!presenceMailId) return;
    const interval = setInterval(() => {
      writePresence(presenceMailId);
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [presenceMailId]);

  useEffect(() => {
    const handleUnload = () => {
      if (presenceMailId && db && userId) {
        clearPresence(presenceMailId);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [presenceMailId]);

  useEffect(() => {
    // ── v22 FIX (unnecessary renders / infinite loop risk): Previously
    // `headerInfo.emailSubject` was in the dependency array. The effect
    // reads it to compare AND writes it via setHeaderInfo — any mismatch
    // between the computed and stored value could cause a perpetual re-run.
    // Fix: remove emailSubject from deps. The effect only needs to react to
    // the inputs that feed the subject calculation (proveedor, especie, mailId).
    const currentProveedor = headerInfo.reDestinatarios;
    const currentEspecie = orderItems[0]?.especie || "";

    const newSubject = generateEmailSubjectValue(
      [currentProveedor],
      [currentEspecie],
      headerInfo.mailId
    );

    // Use functional setter to compare against the truly-current value,
    // avoiding a stale closure read of headerInfo.emailSubject
    setHeaderInfo((prevInfo) => {
      if (prevInfo.emailSubject === newSubject) return prevInfo; // no-op, no re-render
      return { ...prevInfo, emailSubject: newSubject };
    });
  }, [
    headerInfo.reDestinatarios,
    orderItems[0]?.especie,
    headerInfo.mailId,
    // emailSubject intentionally omitted — it is the OUTPUT, not an input
  ]);

  const parseFirestoreOrders = (docs) => {
    const orders = docs.map((d) => {
      const data = d.data();
      let parsedItems = [];
      if (data.items) {
        if (typeof data.items === "string") {
          try { parsedItems = JSON.parse(data.items); } catch { parsedItems = []; }
        } else if (Array.isArray(data.items)) {
          parsedItems = data.items;
        }
      }
      return {
        id: d.id,
        header: data.header,
        items: Array.isArray(parsedItems) ? parsedItems : [],
      };
    });
    return orders.sort((a, b) => (a.header?.createdAt || 0) - (b.header?.createdAt || 0));
  };

  const loadSentHistory = async (currentDrafts = []) => {
    if (!db || !userId) return;
    try {
      const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/pedidos`);
      // Single where clause only — avoids composite index requirement
      const q = query(
        ordersCollectionRef,
        where("header.status", "==", "sent")
      );
      const snapshot = await getDocs(q);
      // Filter by userId in memory
      const sentOrders = parseFirestoreOrders(snapshot.docs).filter(
        (o) => o.header?.lastModifiedBy === userId
      );
      setAllOrdersFromFirestore([...currentDrafts, ...sentOrders]);
    } catch (err) {
      setAllOrdersFromFirestore((prev) => {
        const existingSent = prev.filter((o) => o.header?.status === "sent");
        return [...currentDrafts, ...existingSent];
      });
    }
  };

  const purgeMyDrafts = async () => {
    // Soft-delete todos los drafts existentes del usuario antes de crear uno nuevo
    if (!db || !userId) return;
    const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/pedidos`);
    const q = query(
      ordersCollectionRef,
      where("header.createdBy", "==", userId),
      where("header.status", "==", "draft")
    );
    const snapshot = await getDocs(q);
    await Promise.all(
      snapshot.docs.map((d) => handleSoftDeleteOrderInFirestore(d.id))
    );
  };

  const loadMyDrafts = async ({ silent = false } = {}) => {
    if (!db || !userId) return;
    if (!silent) setIsLoading(true);
    try {
      const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/pedidos`);
      const q = query(
        ordersCollectionRef,
        where("header.createdBy", "==", userId),
        where("header.status", "==", "draft")
      );
      const snapshot = await getDocs(q);
      // ── v22 FIX: guard against setState after unmount
      if (!isMountedRef.current) return;
      // Si es llamada silenciosa (limpiar/nuevo mail) purgar y crear draft limpio
      // Si es llamada normal (post-send) usar drafts existentes
      let drafts = parseFirestoreOrders(snapshot.docs);

      if (silent) {
        // Purgar todos los drafts acumulados y empezar con uno nuevo
        await Promise.all(drafts.map((d) => handleSoftDeleteOrderInFirestore(d.id)));
        drafts = [];
      }

      if (drafts.length === 0) {
        const newRef = doc(ordersCollectionRef);
        const newHeader = {
          ...initialHeaderState,
          mailId: crypto.randomUUID().substring(0, 8).toUpperCase(),
          emailSubject: generateEmailSubjectValue([], []),
          status: "draft",
          createdAt: Date.now(),
          createdBy: userId,
          updatedAt: Date.now(),
        };
        const newItems = [{ ...initialItemState, id: crypto.randomUUID() }];
        await saveOrderToFirestore({ id: newRef.id, isNew: true, header: newHeader, items: newItems });
        if (!isMountedRef.current) return;
        const newDraft = { id: newRef.id, header: newHeader, items: newItems };
        setDisplayedOrders([newDraft]);
        setActiveOrderId(newRef.id);
        activeOrderIdRef.current = newRef.id;
        headerInfoRef.current = newHeader;
        orderItemsRef.current = newItems;
        setHeaderInfo(newHeader);
        setOrderItems(newItems);
        setCurrentOrderIndex(0);
        await loadSentHistory([newDraft]);
      } else {
        setDisplayedOrders(drafts);
        const firstId = drafts[0].id;
        setActiveOrderId(firstId);
        activeOrderIdRef.current = firstId;
        headerInfoRef.current = drafts[0].header;
        orderItemsRef.current = drafts[0].items;
        setHeaderInfo(drafts[0].header);
        setOrderItems(drafts[0].items);
        setCurrentOrderIndex(0);
        await loadSentHistory(drafts);
      }
    } catch (err) {
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const searchByMailId = async (mailId) => {
    if (!db || !mailId) return;
    setIsLoading(true);
    try {
      const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/pedidos`);
      const q = query(
        ordersCollectionRef,
        where("header.mailId", "==", mailId)
      );
      const snapshot = await getDocs(q);
      // ── v22 FIX: guard against setState after unmount
      if (!isMountedRef.current) return;
      const orders = parseFirestoreOrders(snapshot.docs).filter(
        (o) => o.header?.status !== "deleted"
      );

      // Re-fetch sent history so it's always fresh, not stale from prev state
      let freshSent = [];
      try {
        const sentQ = query(
          ordersCollectionRef,
          where("header.status", "==", "sent")
        );
        const sentSnap = await getDocs(sentQ);
        freshSent = parseFirestoreOrders(sentSnap.docs).filter(
          (o) => o.header?.lastModifiedBy === userId
        );
      } catch (_) {
        freshSent = [];
      }
      setAllOrdersFromFirestore((prev) => {
        const existingSent = freshSent.length > 0
          ? freshSent
          : prev.filter((o) => o.header?.status === "sent");
        return [...orders, ...existingSent];
      });

      if (orders.length === 0) {
        loadedHeadersRef.current = {};
        setDisplayedOrders([]);
        setActiveOrderId(null);
        setCurrentOrderIndex(0);
      } else {
        // ── BUG FIX: keep original status from Firestore — never force "draft"
        // Mutating sent→draft here was causing flushAndSave to persist "draft"
        // back to Firestore and handleNewMail to soft-delete sent orders.
        // ── v51.1: guardar baseline de headers para detectar ediciones al enviar
        loadedHeadersRef.current = Object.fromEntries(
          orders.map((o) => [o.id, { ...o.header }])
        );
        setDisplayedOrders(orders);
        const last = orders[orders.length - 1];
        setActiveOrderId(last.id);
        activeOrderIdRef.current = last.id;
        headerInfoRef.current = last.header;
        orderItemsRef.current = last.items;
        setHeaderInfo(last.header);
        setOrderItems(last.items);
        setCurrentOrderIndex(orders.length - 1);

      }
    } catch (err) {
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !userId || !db) return;
    // Al montar: crear un pedido en blanco nuevo, sin cargar drafts anteriores.
    // El usuario parte desde cero cada sesión — puede buscar un mailID existente
    // o simplemente empezar a armar un pedido nuevo.
    const initBlankOrder = async () => {
      setIsLoading(true);
      try {
        // Purgar drafts huérfanos antes de crear uno nuevo
        await purgeMyDrafts();
        const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/pedidos`);
        const newRef = doc(ordersCollectionRef);
        const newHeader = {
          ...initialHeaderState,
          mailId: crypto.randomUUID().substring(0, 8).toUpperCase(),
          emailSubject: generateEmailSubjectValue([], []),
          status: "draft",
          createdAt: Date.now(),
          createdBy: userId,
          updatedAt: Date.now(),
        };
        const newItems = [{ ...initialItemState, id: crypto.randomUUID() }];
        await saveOrderToFirestore({ id: newRef.id, isNew: true, header: newHeader, items: newItems });
        if (!isMountedRef.current) return;
        const newDraft = { id: newRef.id, header: newHeader, items: newItems };
        setDisplayedOrders([newDraft]);
        setActiveOrderId(newRef.id);
        activeOrderIdRef.current = newRef.id;
        setHeaderInfo(newHeader);
        headerInfoRef.current = newHeader;
        setOrderItems(newItems);
        orderItemsRef.current = newItems;
        setCurrentOrderIndex(0);
      } catch (err) {
        recordError("CARGA", err);
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    };
    initBlankOrder();
  }, [isAuthReady, userId]);

  // ── v20 ARCHITECTURE: Single flush helper used by ALL action functions.
  // Reads from refs (always current) unless caller passes explicit overrides.
  // The debounce-autosave also calls this with no arguments — it reads from
  // refs too, so both paths are consistent.
  const saveCurrentFormDataToDisplayed = async (
    explicitHeader = null,
    explicitItems = null
  ) => {
    if (!db || !userId || !activeOrderIdRef.current) return;
    if (!isUserEditing.current) return;

    // Always read from refs — never from closures
    const snapshotHeader = explicitHeader ?? headerInfoRef.current;
    const snapshotItems  = explicitItems  ?? orderItemsRef.current;

    const currentOrderData = {
      id: activeOrderIdRef.current,
      header: { ...snapshotHeader },
      items: snapshotItems.map((item) => ({ ...item })),
    };

    // Always update local displayedOrders — preview and navigation rely on this
    setDisplayedOrders((prev) =>
      prev.map((o) => (o.id === activeOrderIdRef.current ? { ...o, ...currentOrderData } : o))
    );

    // ── SENT MODE GUARD: mientras el usuario navega/visualiza un pedido sent
    // recuperado por Mail ID, el autosave por blur NO escribe el header a
    // Firestore en caliente — evita pisar datos con valores parciales.
    const activeOrderStatus = displayedOrders.find(
      (o) => o.id === activeOrderIdRef.current
    )?.header?.status;
    const isViewingSearchedMail = !!committedSearchTermRef.current;

    if (isViewingSearchedMail && activeOrderStatus === "sent") {
      return;
    }

    await saveOrderToFirestore(currentOrderData);
  };

  // ── v20: Central flush used by all action functions (navigate/send/preview/
  // finalize/search). Cancels any pending debounce and immediately persists
  // the current ref state to both displayedOrders and Firestore.
  //
  // ── v21: Forces blur on the currently focused element before reading refs.
  // This ensures that if the user clicks an action button while a field still
  // has focus (no blur has fired yet), the onBlur formatting handler runs
  // and the formatted value is captured in the ref before we save.
  const flushAndSave = async () => {
    // Force blur so that any pending onBlur handlers (formatters) run
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
      // Yield one microtask tick so that React processes the blur setState
      // before we read from refs
      await new Promise((r) => setTimeout(r, 0));
    }

    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
      pendingSaveTimeout.current = null;
    }
    // ── IMPORTANT: set isUserEditing=true so saveCurrentFormDataToDisplayed
    // doesn't skip the save (guard requires isUserEditing to be true).
    // flushAndSave is ONLY called from explicit user actions (navigate/send/preview)
    // so it is always correct to force-save here regardless of editing state.
    isUserEditing.current = true;
    await saveCurrentFormDataToDisplayed();
    isUserEditing.current = false;
  };

  const handleHeaderChange = (e) => {
    const { name, value } = e.target;
    setHeaderInfo((prevInfo) => ({ ...prevInfo, [name]: value }));
  };

  const handleHeaderBlur = (e) => {
    const { name, value, type } = e.target;
    if (
      type !== "date" &&
      type !== "number" &&
      name !== "emailSubject" &&
      name !== "mailId"
    ) {
      setHeaderInfo((prevInfo) => ({
        ...prevInfo,
        [name]: value.toUpperCase(),
      }));
    }
  };

  const handleFocusField = () => {
    isUserEditing.current = true;
    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
      pendingSaveTimeout.current = null;
    }
  };

  // ── FOB/FOT GLOBAL: aplica el Incoterm a TODOS los pedidos de la operación
  // (displayedOrders = pedidos de la operación activa, sin eliminados).
  const handleIncotermChange = async (term) => {
    if (!["FOB", "FOT"].includes(term)) return;

    const prevTerm = headerInfoRef.current.incoterm || "FOB";
    const prevDisplayed = displayedOrders;               // snapshot para revertir
    const activeId = activeOrderIdRef.current;
    const mySeq = ++incotermSeqRef.current;

    // 1) UI + ref síncronos (el autosave/flush leen el ref y no pisan el valor nuevo)
    headerInfoRef.current = { ...headerInfoRef.current, incoterm: term };
    setHeaderInfo((prev) => ({ ...prev, incoterm: term }));
    setDisplayedOrders((prev) =>
      prev.map((o) =>
        o.header?.status === "deleted"
          ? o
          : { ...o, header: { ...o.header, incoterm: term } }
      )
    );

    if (!db || !userId) return;

    // 2) Persistencia. Los "sent" no se escriben en caliente (SENT MODE GUARD):
    //    se persisten al enviar (ver performSendEmail). Solo se escriben los borradores.
    const draftIds = prevDisplayed
      .filter((o) => o.id && o.header?.status === "draft")
      .map((o) => o.id);
    if (draftIds.length === 0) return;

    // Cola: las escrituras salen en orden y la última selección es la que queda.
    const run = incotermWriteQueueRef.current.then(async () => {
      const batch = writeBatch(db);
      draftIds.forEach((id) => {
        batch.update(
          doc(db, `artifacts/${appId}/public/data/pedidos`, id),
          { "header.incoterm": term }          // únicamente este campo
        );
      });
      await batch.commit();                      // atómico: todo o nada
    });
    incotermWriteQueueRef.current = run.catch(() => {});

    try {
      await run;
    } catch (error) {
      console.error("[FRUTAM:INCOTERM] Error al guardar", error);
      // Solo revierte si no hubo una selección más reciente
      if (mySeq === incotermSeqRef.current && isMountedRef.current) {
        const prevById = Object.fromEntries(
          prevDisplayed.map((o) => [o.id, o.id === activeId ? prevTerm : (o.header?.incoterm || "FOB")])
        );
        headerInfoRef.current = { ...headerInfoRef.current, incoterm: prevTerm };
        setHeaderInfo((prev) => ({ ...prev, incoterm: prevTerm }));
        setDisplayedOrders((prev) =>
          prev.map((o) =>
            prevById[o.id] !== undefined
              ? { ...o, header: { ...o.header, incoterm: prevById[o.id] } }
              : o
          )
        );
        notify("error", "No se pudo actualizar el Incoterm en todos los pedidos. Se restauró el valor anterior; inténtalo de nuevo.");
      }
    }
  };

  // ── v20 ARCHITECTURE: The v19 fix introduced pendingItemsRef/pendingHeaderRef
  // as a two-step intermediate. This added complexity without full coverage
  // (headerInfo still had a stale closure risk in v19).
  //
  // The correct and complete solution is simpler:
  //   • orderItemsRef.current  — always the freshest orderItems (synced above)
  //   • headerInfoRef.current  — always the freshest headerInfo (synced above)
  //
  // All action functions (navigate, finalize, send, preview, search) read from
  // these refs directly. No intermediate pending refs needed.
  //
  // The debounce-based autosave is KEPT but its only job is Firestore
  // persistence during idle time. It is never relied upon for correctness —
  // all critical paths flush explicitly before acting.

  const handleBlurField = (originalBlurFn) => (e) => {
    if (originalBlurFn) originalBlurFn(e);

    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
    }
    // Debounce only for idle Firestore persistence. Action functions do NOT
    // wait for this — they read from refs directly (see flushAndSave below).
    pendingSaveTimeout.current = setTimeout(async () => {
      pendingSaveTimeout.current = null;
      try {
        await saveCurrentFormDataToDisplayed();
      } catch {
        // v52: el error ya se informó con un aviso
      }
      isUserEditing.current = false;
    }, 300);
  };

  // ── v22 FIX (unnecessary renders): handleItemChange and handleItemBlur are
  // called on every input in the table. If they are inline arrow functions,
  // React creates a new function reference on every render of the parent,
  // which forces every input to re-render even when unrelated state changes
  // (e.g. headerInfo updates cause all table inputs to re-render).
  // Stabilizing with useCallback ensures stable references between renders.
  // Note: these still update correctly because they use functional setState.
  const handleItemChange = React.useCallback((itemId, e) => {
    const { name, value } = e.target;
    // ── v40: clamp pallets to 0 minimum on every change
    const sanitized = name === "pallets" && value !== ""
      ? String(Math.max(0, parseFloat(value) || 0))
      : value;
    setOrderItems((prevItems) =>
      prevItems.map((item) =>
        item.id === itemId ? { ...item, [name]: sanitized } : item
      )
    );
  }, []); // no deps — uses only stable setState

  const handleItemBlur = React.useCallback((itemId, e) => {
    const { name, value, type } = e.target;
    setOrderItems((prevItems) => {
      const updatedItems = prevItems.map((item) => {
        if (item.id === itemId) {
          let newValue = value;
          if (name === "preciosFOB") {
            const matches = value.match(/\d+([.,]\d+)?/g);
            const formattedPrices = [];
            if (matches && matches.length > 0) {
              for (const match of matches) {
                const numericValue = parseFloat(match.replace(",", "."));
                if (!isNaN(numericValue)) {
                  formattedPrices.push(`$ ${numericValue.toFixed(2).replace(".", ",")}`);
                }
              }
            }
            newValue = formattedPrices.length > 0 ? formattedPrices.join(" - ") : "";
          } else if (name === "calibre") {
            const parts = value.split(/[,;\s-]+/).filter((part) => part.trim() !== "").map((part) => part.trim().toUpperCase());
            newValue = parts.join(" - ");
          } else if (name === "categoria") {
            const matches = value.match(/[a-zA-Z0-9]+/g);
            newValue = matches && matches.length > 0 ? matches.join(" - ").toUpperCase() : "";
          } else if (name === "pallets") {
            // ── v40: enforce minimum 0 on blur (covers paste and autofill)
            const parsed = parseFloat(value);
            newValue = isNaN(parsed) ? "" : String(Math.max(0, parsed));
          } else if (type !== "number") {
            newValue = value.toUpperCase();
          }
          return { ...item, [name]: newValue };
        }
        return item;
      });
      return updatedItems;
    });
  }, []); // no deps — pure transformation using only event data

  const handleAddItem = (sourceItemId = null) => {
    // ── v22 FIX (duplicate writes + stale closure): Previously saveOrderToFirestore
    // was called INSIDE the setOrderItems setter. This caused two problems:
    //   1. `headerInfo` captured in the setter is the stale closure value, not the
    //      current header (same class of bug as the original stale-closure series).
    //   2. The debounce autosave would also fire ~300ms later — two writes in flight.
    // Fix: compute the next items first, then write once using refs.
    setOrderItems((prevItems) => {
      let updatedItems;
      if (sourceItemId) {
        const sourceItem = prevItems.find((item) => item.id === sourceItemId);
        if (sourceItem) {
          // v52.2: la observación es del pedido (1ª fila); al duplicar no se copia
          const newItem = { ...sourceItem, id: crypto.randomUUID(), isCanceled: false, estado: "" };
          const index = prevItems.findIndex((item) => item.id === sourceItemId);
          updatedItems = [
            ...prevItems.slice(0, index + 1),
            newItem,
            ...prevItems.slice(index + 1),
          ];
        } else {
          updatedItems = [
            ...prevItems,
            {
              id: crypto.randomUUID(), pallets: "", especie: "", variedad: "",
              formato: "", calibre: "", categoria: "", preciosFOB: "", estado: "",
              isCanceled: false,
            },
          ];
        }
      } else {
        updatedItems = [
          ...prevItems,
          {
            id: crypto.randomUUID(), pallets: "", especie: "", variedad: "",
            formato: "", calibre: "", categoria: "", preciosFOB: "", estado: "",
            isCanceled: false,
          },
        ];
      }
      // Schedule the Firestore write AFTER React commits the state update,
      // reading from refs (always current) to avoid stale closures.
      setTimeout(() => {
        saveOrderToFirestore({
          id: activeOrderIdRef.current,
          header: { ...headerInfoRef.current },
          items: updatedItems,
          rowAction: true, // v51.4
        }).catch(() => {});
      }, 0);
      return updatedItems;
    });
  };

  const handleDeleteItem = (idToDelete) => {
    setOrderItems((prevItems) => {
      if (prevItems.length <= 1) return prevItems;
      const updatedItems = prevItems.filter((item) => item.id !== idToDelete);
      // ── v22 FIX: write outside setter using refs (not stale closures)
      setTimeout(() => {
        saveOrderToFirestore({
          id: activeOrderIdRef.current,
          header: { ...headerInfoRef.current },
          items: updatedItems,
          rowAction: true, // v51.4
        }).catch(() => {});
      }, 0);
      return updatedItems;
    });
  };

  const handleDragReorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setOrderItems((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      // ── v22 FIX: write outside setter using refs
      setTimeout(() => {
        saveOrderToFirestore({
          id: activeOrderIdRef.current,
          header: { ...headerInfoRef.current },
          items: updated,
          rowAction: true, // v51.4
        }).catch(() => {});
      }, 0);
      return updated;
    });
  };

  const toggleItemCancellation = (itemId) => {
    setOrderItems((prevItems) => {
      const updatedItems = prevItems.map((item) => {
        if (item.id === itemId) {
          const newIsCanceled = !item.isCanceled;
          return { ...item, isCanceled: newIsCanceled, estado: newIsCanceled ? "CANCELADO" : "" };
        }
        return item;
      });
      // ── v22 FIX: write outside setter using refs
      setTimeout(() => {
        saveOrderToFirestore({
          id: activeOrderIdRef.current,
          header: { ...headerInfoRef.current },
          items: updatedItems,
          rowAction: true, // v51.4
        }).catch(() => {});
      }, 0);
      return updatedItems;
    });
  };

  const currentOrderTotalPallets = orderItems.reduce((sum, item) => {
    if (item.isCanceled) {
      return sum;
    }
    // ── v39: Math.max(0, ...) prevents negative pallet values from
    // pulling the total below zero
    const pallets = Math.max(0, parseFloat(item.pallets) || 0);
    return sum + pallets;
  }, 0);

  const formatDateToSpanish = (dateString) => {
    const months = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const daysOfWeek = [
      "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
    ];
    try {
      const date = new Date(dateString + "T00:00:00");
      if (isNaN(date.getTime())) {
        return dateString;
      }
      const dayOfWeek = daysOfWeek[date.getDay()];
      const dayOfMonth = date.getDate();
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      return `${dayOfWeek} ${dayOfMonth} de ${month} de ${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const escapeHtml = (str) => {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // ── v26: calculates the approximate pixel width a single order's table
  // would need, based on character counts in each column. Used to find the
  // widest order so all cards can be rendered at the same width.
  const measureOrderWidth = (orderHeader, orderItemsData) => {
    // px per character (Arial 11px ≈ 7px/char) + column padding (28px = 14px each side)
    const PX_PER_CHAR = 7;
    const COL_PADDING = 28;

    // Column headers (minimum width per column)
    const headers = ["Pallets", "Especie", "Variedad", "Formato", "Calibre", "Categoría",
      `Precios ${orderHeader.incoterm || "FOB"}`];

    // For each column, find the max char length across header + all data rows
    const colWidths = headers.map((h, colIdx) => {
      const colKey = ["pallets","especie","variedad","formato","calibre","categoria","preciosFOB"][colIdx];
      const maxDataLen = orderItemsData.reduce((max, item) => {
        const val = String(item[colKey] || "");
        return Math.max(max, val.length);
      }, 0);
      return Math.max(h.length, maxDataLen) * PX_PER_CHAR + COL_PADDING;
    });

    // Total table width = sum of all columns
    // Add card padding (15px each side = 30px) + border (2px)
    return colWidths.reduce((a, b) => a + b, 0) + 32;
  };

  const generateSingleOrderHtml = (
    orderHeader,
    orderItemsData,
    orderNumber,
    fixedWidth = null   // ── v26: if provided, card renders at this exact px width
  ) => {
    const nonCancelledItems = orderItemsData.filter((item) => !item.isCanceled);
    const singleOrderTotalPallets = nonCancelledItems.reduce((sum, item) => {
      const pallets = Math.max(0, parseFloat(item.pallets) || 0);
      return sum + pallets;
    }, 0);

    const allObservations = orderItemsData
      .map((item) => item.estado)
      .filter(
        (obs) => obs && obs.trim() !== "" && obs.toUpperCase() !== "CANCELADO"
      );

    const consolidatedObservationsText =
      allObservations.length > 0 ? escapeHtml(allObservations.join(" – ")) : "";

    const formattedNave       = escapeHtml(orderHeader.nave         || "");
    const formattedPais       = escapeHtml(orderHeader.deNombrePais || "");
    const formattedFechaCarga = escapeHtml(
      orderHeader.fechaCarga ? formatDateToSpanish(orderHeader.fechaCarga) : ""
    );
    const formattedExporta    = escapeHtml(orderHeader.exporta  || "");
    const incotermLabel       = escapeHtml(orderHeader.incoterm || "FOB");

    const orderBlockExtra = orderHeader.status === "deleted"
      ? "opacity:0.6;text-decoration:line-through;"
      : "";

    // ── v32: header fields use <table> rows instead of <p> tags
    // so Outlook respects font-size and color when HTML is pasted

    // ── v18: padding duplicado para mayor legibilidad en el email ──────────────
    const thStyle =
      "font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#ffffff;mso-color-alt:#ffffff;" +
      "background-color:#2563eb;padding:4px 8px;" +
      "border-top:1px solid #1e40af;border-bottom:1px solid #1e40af;" +
      "border-left:1px solid #1e40af;border-right:1px solid #1e40af;" +
      "text-align:center;white-space:nowrap;vertical-align:middle;";

    const tdBase =
      "font-family:Arial,sans-serif;font-size:11px;color:#333333;mso-color-alt:#333333;" +
      "padding:4px 8px;text-align:center;white-space:nowrap;vertical-align:middle;" +
      "border-top:1px solid #dddddd;border-bottom:1px solid #dddddd;" +
      "border-left:1px solid #dddddd;border-right:1px solid #dddddd;";

    const tdTotalLabel =
      "font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#333333;mso-color-alt:#333333;" +
      "background-color:#f0f0f0;padding:6px 14px 6px 6px;text-align:right;" +
      "white-space:nowrap;vertical-align:middle;" +
      "border-top:1px solid #dddddd;border-bottom:1px solid #dddddd;" +
      "border-left:1px solid #dddddd;border-right:1px solid #dddddd;";

    const tdTotalValue =
      "font-family:Arial,sans-serif;font-size:11px;font-weight:bold;color:#333333;mso-color-alt:#333333;" +
      "background-color:#f0f0f0;padding:6px 14px;text-align:center;" +
      "white-space:nowrap;vertical-align:middle;" +
      "border-top:1px solid #dddddd;border-bottom:1px solid #dddddd;" +
      "border-left:1px solid #dddddd;border-right:1px solid #dddddd;";

    const dataRowsHtml = orderItemsData
      .map((item, idx) => {
        const rowBg = idx % 2 === 0 ? "#f9f9f9" : "#ffffff";
        const cancelExtra = item.isCanceled
          ? "color:#ef4444;text-decoration:line-through;"
          : "";
        const td = tdBase + `background-color:${rowBg};` + cancelExtra;
        return (
          `<tr style="background-color:${rowBg};">` +
          `<td style="${td}">${escapeHtml(item.pallets    || "")}</td>` +
          `<td style="${td}">${escapeHtml(item.especie    || "")}</td>` +
          `<td style="${td}">${escapeHtml(item.variedad   || "")}</td>` +
          `<td style="${td}">${escapeHtml(item.formato    || "")}</td>` +
          `<td style="${td}">${escapeHtml(item.calibre    || "")}</td>` +
          `<td style="${td}">${escapeHtml(item.categoria  || "")}</td>` +
          `<td style="${td}">${escapeHtml(item.preciosFOB || "")}</td>` +
          `</tr>`
        );
      })
      .join("");

    const cardWidthStyle = fixedWidth ? `width:${fixedWidth}px;` : "";
    const tableWidthStyle = fixedWidth ? `width:${fixedWidth - 32}px;` : "width:auto;";

    return `
<div style="margin-bottom:48px;margin-left:16px;display:inline-block;${cardWidthStyle}${orderBlockExtra}">
<div style="font-family:Arial,sans-serif;font-size:11px;color:#333333;mso-color-alt:#333333;background-color:#f8f8f8;border:1px solid #dddddd;border-radius:8px;padding:15px;text-align:left;box-sizing:border-box;">

  <div style="margin-bottom:10px;">
    <p style="margin:0 0 3px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.4;"><span style="font-weight:bold;">País:</span> ${formattedPais}</p>
    <p style="margin:0 0 3px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.4;"><span style="font-weight:bold;">Nave:</span> ${formattedNave}</p>
    <p style="margin:0 0 3px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.4;"><span style="font-weight:bold;">Fecha de carga:</span> ${formattedFechaCarga}</p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.4;"><span style="font-weight:bold;">Exporta:</span> ${formattedExporta}</p>
  </div>

  <table cellpadding="0" cellspacing="0" border="0"
    style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;${tableWidthStyle}table-layout:auto;margin-top:8px;">
    <thead>
      <tr style="background-color:#2563eb;">
        <th style="${thStyle}">Pallets</th>
        <th style="${thStyle}">Especie</th>
        <th style="${thStyle}">Variedad</th>
        <th style="${thStyle}">Formato</th>
        <th style="${thStyle}">Calibre</th>
        <th style="${thStyle}">Categoría</th>
        <th style="${thStyle}">Precios ${incotermLabel}</th>
      </tr>
    </thead>
    <tbody>
      ${dataRowsHtml}
      <tr style="background-color:#f0f0f0;">
        <td colspan="6" style="${tdTotalLabel}">Total de Pallets:</td>
        <td colspan="1" style="${tdTotalValue}">${singleOrderTotalPallets} Pallets</td>
      </tr>
    </tbody>
  </table>

  <p style="margin-top:10px;margin-bottom:0;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;">
    Observaciones: <span style="font-weight:normal;font-style:italic;font-size:11px;font-family:Arial,sans-serif;">${consolidatedObservationsText}</span>
  </p>

</div>
</div>`;
  };

  const copyFormattedContentToClipboard = async (content) => {
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([content], { type: "text/html" }),
            "text/plain": new Blob([content], { type: "text/plain" }),
          }),
        ]);
        return;
      } catch (err) {
      }
    }

    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = content;
      tempDiv.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;pointer-events:none;";
      document.body.appendChild(tempDiv);

      const range = document.createRange();
      range.selectNodeContents(tempDiv);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const success = document.execCommand("copy");
      selection.removeAllRanges();
      document.body.removeChild(tempDiv);

      if (success) {
        return;
      }
    } catch (err) {
    }

    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
    }
  };

  const handleAddOrder = async () => {
    if (!userId) {
      notify("error", "No hay conexión con la base de datos (sin sesión). Revisa el aviso rojo en la parte superior.");
      return;
    }
    if (addingOrderRef.current) return;
    addingOrderRef.current = true;
    setAddingOrder(true);
    try {
      await handleAddOrderInner();
    } catch {
      // el aviso de error ya se mostró en saveOrderToFirestore
    } finally {
      addingOrderRef.current = false;
      if (isMountedRef.current) setAddingOrder(false);
    }
  };

  const handleAddOrderInner = async () => {
    if (!db || !userId) return;

    if (activeOrderId) {
      await flushAndSave();
    }

    // Read from refs after flush
    const currentHeader = headerInfoRef.current;

    let mailIdToAssignForNewOrder = "";
    if (committedSearchTerm) {
      mailIdToAssignForNewOrder = committedSearchTerm;
    } else {
      if (currentHeader.mailId && currentHeader.status === "draft") {
        mailIdToAssignForNewOrder = currentHeader.mailId;
      } else {
        mailIdToAssignForNewOrder = crypto.randomUUID().substring(0, 8).toUpperCase();
      }
    }

    const ordersCollectionRef = collection(db, `artifacts/${appId}/public/data/pedidos`);
    const newOrderDocRef = doc(ordersCollectionRef);
    const newOrderId = newOrderDocRef.id;

    const newBlankHeader = {
      ...initialHeaderState,
      reDestinatarios: currentHeader.reDestinatarios,
      // Hereda el Incoterm global vigente (pedido activo); si no es válido, usa FOB
      incoterm: ["FOB", "FOT"].includes(currentHeader.incoterm)
        ? currentHeader.incoterm
        : initialHeaderState.incoterm,
      emailSubject: generateEmailSubjectValue(
        [currentHeader.reDestinatarios],
        [],
        mailIdToAssignForNewOrder
      ),
      mailId: mailIdToAssignForNewOrder,
      status: "draft",
      createdAt: Date.now(),
      createdBy: userId,
      updatedAt: Date.now(),
    };
    const newBlankItems = [{ ...initialItemState, id: crypto.randomUUID() }];

    await saveOrderToFirestore({
      id: newOrderId,
      isNew: true,
      header: newBlankHeader,
      items: newBlankItems,
    });

    const newOrder = { id: newOrderId, header: newBlankHeader, items: newBlankItems };
    setDisplayedOrders((prev) => [...prev, newOrder]);
    setCurrentOrderIndex(displayedOrders.length); // length before adding = new last index
    setActiveOrderId(newOrderId);
    setHeaderInfo(newBlankHeader);
    setOrderItems(newBlankItems);
    // Only allow suggestion again if new order has no proveedor (user will type a new one)
    if (!committedSearchTerm && !newBlankHeader.reDestinatarios) suggestionAppliedRef.current = "";
  };

  // v52: navegación directa a cualquier pedido (pestañas). Si el guardado
  // previo falla, se queda en el pedido actual (el aviso ya se mostró).
  const goToOrder = async (newIndex) => {
    if (newIndex === currentOrderIndex || newIndex < 0 || newIndex >= displayedOrders.length) return;
    try {
      await flushAndSave();
    } catch {
      return;
    }
    const target = displayedOrders[newIndex];
    if (target) {
      setActiveOrderId(target.id);
      setHeaderInfo(target.header);
      setOrderItems(target.items);
      setCurrentOrderIndex(newIndex);
    }
  };

  const handleDeleteCurrentOrder = async () => {
    try {
      if (displayedOrders.length <= 1) return;

      const orderIdToSoftDelete = displayedOrders[currentOrderIndex].id;
      await handleSoftDeleteOrderInFirestore(orderIdToSoftDelete);

      const updated = displayedOrders.filter((o) => o.id !== orderIdToSoftDelete);
      setDisplayedOrders(updated);

      const newIndex = Math.min(currentOrderIndex, updated.length - 1);
      const target = updated[newIndex];
      if (target) {
        setActiveOrderId(target.id);
        setHeaderInfo(target.header);
        setOrderItems(target.items);
        setCurrentOrderIndex(newIndex);
      } else {
        // No quedan pedidos — dejar UI vacía, no recargar drafts automáticamente
        setDisplayedOrders([]);
        setActiveOrderId(null);
        activeOrderIdRef.current = null;
        setCurrentOrderIndex(0);
        setHeaderInfo({ ...initialHeaderState });
        headerInfoRef.current = { ...initialHeaderState };
        setOrderItems([{ ...initialItemState, id: crypto.randomUUID() }]);
        orderItemsRef.current = [{ ...initialItemState, id: crypto.randomUUID() }];
      }
    } catch (error) {
    }
  };

  const handleSearchClick = async () => {
    const term = searchTerm.toUpperCase().trim();
    if (!term) return;
    // v52: mismo formato que exigen las reglas de Firestore
    if (!/^[A-Z0-9]{4,12}$/.test(term)) {
      notify("error", "El Mail ID solo admite letras y números, entre 4 y 12 caracteres (ej. 5B7D7692).");
      return;
    }
    if (searchingRef.current) return;
    searchingRef.current = true;
    setIsSearching(true);
    try {
      await handleSearchInner(term);
    } catch {
      notify("error", "No se pudo completar la búsqueda. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      searchingRef.current = false;
      if (isMountedRef.current) setIsSearching(false);
    }
  };

  const handleSearchInner = async (term) => {

    suggestionAppliedRef.current = "";

    if (activeOrderId) await flushAndSave();

    const conflicts = await checkPresenceConflict(term);
    if (conflicts.length > 0) {
      setPresenceConflictUsers(conflicts);
      setPendingSearchTerm(term);
      setShowPresenceModal(true);
    } else {
      await enterMailId(term);
    }
  };

  const enterMailId = async (term) => {
    if (presenceMailId && presenceMailId !== term) {
      await clearPresence(presenceMailId);
      if (presenceUnsubscribeRef.current) {
        presenceUnsubscribeRef.current();
        presenceUnsubscribeRef.current = null;
      }
    }
    setPresenceMailId(term);
    await writePresence(term);
    subscribeToPresence(term);
    setCommittedSearchTerm(term);
    committedSearchTermRef.current = term;

    await searchByMailId(term);
  };

  const handleClearSearch = async () => {
    // Use ref for activeOrderId to avoid stale closure — check status via displayedOrders
    const activeStatus = displayedOrders.find(
      (o) => o.id === activeOrderIdRef.current
    )?.header?.status;
    if (activeOrderIdRef.current && activeStatus !== "sent") {
      await flushAndSave();
    }

    if (presenceMailId) {
      await clearPresence(presenceMailId);
      if (presenceUnsubscribeRef.current) {
        presenceUnsubscribeRef.current();
        presenceUnsubscribeRef.current = null;
      }
      setPresenceMailId(null);
      setOtherUsersPresent([]);
    }

    // Reset UI immediately — don't wait for Firestore
    setSearchTerm("");
    setCommittedSearchTerm("");
    committedSearchTermRef.current = "";
    setDisplayedOrders([]);
    setActiveOrderId(null);
    activeOrderIdRef.current = null;
    setCurrentOrderIndex(0);
    setHeaderInfo({ ...initialHeaderState });
    headerInfoRef.current = { ...initialHeaderState };
    setOrderItems([{ ...initialItemState, id: crypto.randomUUID() }]);
    orderItemsRef.current = [{ ...initialItemState, id: crypto.randomUUID() }];
    setProveedorSuggestion(null);
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    suggestionAppliedRef.current = "";

    await loadMyDrafts({ silent: true });
  };


  const isMobileDevice = () => {
    return window.innerWidth <= 767;
  };

  const performSendEmail = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    try {
      await performSendEmailInner();
    } finally {
      sendingRef.current = false;
      if (isMountedRef.current) setIsSending(false);
    }
  };

  const performSendEmailInner = async () => {
    try {
      if (!db || !userId) {
        return;
      }

      // ── Capture displayedOrders y headerInfo synchronously BEFORE any await.
      // React state reads inside async functions after an await may return
      // stale values — this snapshot is always current.
      // IMPORTANTE: headerInfo se captura del estado React (no del ref) porque
      // cuando el pedido es "sent", el SENT MODE GUARD bloquea la escritura del
      // header en flushAndSave — el ref queda desactualizado pero el estado React
      // siempre tiene los valores que el usuario editó en pantalla.
      const displayedOrdersSnapshot = displayedOrders;
      const headerInfoSnapshot = { ...headerInfo };

      // Flush any pending blur state then persist to Firestore before acting
      await flushAndSave();

      // Para items usamos el ref (siempre actualizado — el guard no lo bloquea).
      // Para el header usamos el snapshot del estado React capturado antes del
      // primer await, que refleja exactamente lo que el usuario tiene en pantalla.
      const latestHeader = headerInfoSnapshot;
      const latestItems  = orderItemsRef.current;


      const mailGlobalId = latestHeader.mailId;

      if (!mailGlobalId) {
        setShowOrderActionsModal(false);
        return;
      }

      const ordersCollectionRef = collection(
        db,
        `artifacts/${appId}/public/data/pedidos`
      );

      let ordersToProcess;

      if (committedSearchTermRef.current) {
        ordersToProcess = displayedOrdersSnapshot
          .filter((o) => o.header?.status !== "deleted")
          .map((o) => o.id === activeOrderIdRef.current
            ? { ...o, header: { ...latestHeader }, items: latestItems.map(i => ({ ...i })) }
            : { ...o }
          );
      } else {
        // ── DRAFT MODE: group drafts by mailId, then merge local state
        const currentProveedor = latestHeader.reDestinatarios;
        if (currentProveedor && mailGlobalId) {
          const ordersToGroupQuery = query(
            ordersCollectionRef,
            where("header.status", "==", "draft"),
            where("header.reDestinatarios", "==", currentProveedor)
          );
          const ordersToGroupSnapshot = await getDocs(ordersToGroupQuery);
          const batch = writeBatch(db);
          let mutationCount = 0;

          ordersToGroupSnapshot.docs.forEach((docSnapshot) => {
            const orderData = docSnapshot.data();
            const existingMailId = orderData.header?.mailId;
            const docCreatedBy = orderData.header?.createdBy;

            if (docCreatedBy !== userId) {
              return;
            }

            if (!existingMailId || existingMailId !== mailGlobalId) {
              const orderRef = doc(
                db,
                `artifacts/${appId}/public/data/pedidos`,
                docSnapshot.id
              );
              batch.update(orderRef, { "header.mailId": mailGlobalId });
              mutationCount++;
            }
          });

          if (mutationCount > 0) {
            await batch.commit();
          }
        }

        const q = query(
          ordersCollectionRef,
          where("header.mailId", "==", mailGlobalId)
        );
        const querySnapshot = await getDocs(q);

        // v51.6: parser tolerante (un items corrupto ya no aborta el envío)
        ordersToProcess = parseFirestoreOrders(querySnapshot.docs);

        ordersToProcess = ordersToProcess.filter(
          (order) => order.header?.status !== "deleted"
        );

        const activeOrderCurrentState = {
          id: activeOrderId,
          header: { ...latestHeader },
          items: latestItems.map((item) => ({ ...item })),
        };

        const existingIndexInProcess = ordersToProcess.findIndex(
          (o) => o.id === activeOrderId
        );
        if (existingIndexInProcess !== -1) {
          if (activeOrderCurrentState.header?.status !== "deleted") {
            ordersToProcess[existingIndexInProcess] = activeOrderCurrentState;
          } else {
            ordersToProcess.splice(existingIndexInProcess, 1);
          }
        } else if (
          activeOrderCurrentState.id &&
          activeOrderCurrentState.header?.mailId === mailGlobalId &&
          activeOrderCurrentState.header?.status !== "deleted"
        ) {
          ordersToProcess.push(activeOrderCurrentState);
        }
      }

      ordersToProcess.sort((a, b) => {
        const dateA = a.header?.createdAt || 0;
        const dateB = b.header?.createdAt || 0;
        return dateA - dateB;
      });

      // ── FOB/FOT GLOBAL: el Incoterm del pedido activo rige para todos los
      // pedidos de la operación (correo y datos persistidos).
      ordersToProcess = ordersToProcess.map((o) => ({
        ...o,
        header: { ...o.header, incoterm: latestHeader.incoterm || "FOB" },
      }));

      for (const order of ordersToProcess) {
        const orderDocRef = doc(
          db,
          `artifacts/${appId}/public/data/pedidos`,
          order.id
        );
        const isActiveOrder = order.id === activeOrderIdRef.current;

        if (order.header?.status === "draft") {
          // DRAFT: solo el creador puede cambiar status a sent
          if (order.header?.createdBy && order.header.createdBy !== userId) {
            continue;
          }
          const updatePayload = {
            "header.mailId": mailGlobalId,
            "header.status": "sent",
            "header.incoterm": latestHeader.incoterm || "FOB",
            "header.lastModifiedBy": userId,
            "header.updatedAt": Date.now(),
          };
          if (isActiveOrder) {
            updatePayload["items"] = JSON.stringify(latestItems);
          }
          await updateDoc(orderDocRef, updatePayload);
          const idx = ordersToProcess.indexOf(order);
          if (idx !== -1) {
            ordersToProcess[idx] = {
              ...order,
              header: { ...order.header, status: "sent", mailId: mailGlobalId }
            };
          }
        } else if (order.header?.status === "sent") {
          // SENT: cualquier usuario puede persistir ediciones — no hay cambio de
          // ownership. El guard de createdBy NO aplica aquí porque el pedido ya
          // fue enviado y cualquier usuario del equipo puede corregir y re-enviar.
          const updatedItems = isActiveOrder ? latestItems : order.items;

          // ── FIX: cuando es el pedido activo, persistir también los campos del
          // header que el usuario modificó. El SENT MODE GUARD bloqueó el autosave
          // por blur, por lo que headerInfoRef quedó desactualizado — usamos
          // latestHeader (capturado del estado React antes del primer await).
          const updatePayload: Record<string, any> = {
            items: JSON.stringify(updatedItems),
            "header.incoterm": latestHeader.incoterm || "FOB",
            "header.lastModifiedBy": userId,
            "header.updatedAt": Date.now(),
          };

          if (isActiveOrder) {
            const skipFields = new Set(["createdBy", "createdAt", "status"]);
            Object.entries(latestHeader).forEach(([key, value]) => {
              if (!skipFields.has(key)) {
                updatePayload[`header.${key}`] = value;
              }
            });

          } else {
            // ── v51.1: pedido sent NO activo: además de items, persistir solo los
            // campos de header que el usuario cambió respecto de lo cargado.
            const baseline = loadedHeadersRef.current[order.id];
            if (baseline) {
              EDITABLE_HEADER_FIELDS.forEach((key) => {
                const current = order.header?.[key] ?? "";
                const original = baseline[key] ?? "";
                if (current !== original) {
                  updatePayload[`header.${key}`] = current;
                }
              });
            }
          }

          await updateDoc(orderDocRef, updatePayload);
        }
      }

      if (ordersToProcess.length === 0) {
        setPreviewHtmlContent(
          '<p style="text-align: center; color: #888;">No hay pedidos activos para enviar con este ID de Mail. Todos los pedidos asociados están eliminados o no existen.</p>'
        );
        setIsShowingPreview(true);
        setEmailActionTriggered(false);
        return;
      }

      let innerEmailContentHtml = "";
      const allProveedores = new Set();
      const allEspecies = new Set();

      // ── v26: compute the widest card so all cards render at the same width
      const maxWidth = Math.max(...ordersToProcess.map(o => measureOrderWidth(o.header, o.items)));

      ordersToProcess.forEach((order, index) => {
        innerEmailContentHtml += `
            <div style="margin-bottom:8px;margin-left:16px;">
              <h3 style="margin:0 0 6px 0;font-size:16px;color:#2563eb;font-family:Arial,sans-serif;">Pedido #${index + 1}</h3>
            </div>
            ${generateSingleOrderHtml(order.header, order.items, index + 1, maxWidth)}
        `;

        if (order.header.reDestinatarios)
          allProveedores.add(order.header.reDestinatarios);
        order.items.forEach((item) => {
          if (item.especie) allEspecies.add(item.especie);
        });
      });

      const consolidatedSubject = generateEmailSubjectValue(
        Array.from(allProveedores),
        Array.from(allEspecies),
        ""
      );

      const fullEmailBodyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Detalle de Pedido</title>
</head>
<body style="margin:0;padding:16px 16px 16px 16px;background-color:#f8f8f8;font-family:Arial,sans-serif;">
  <div style="width:100%;text-align:right;margin-bottom:12px;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;color:#ef4444;">Mail ID: ${escapeHtml(mailGlobalId)}</div>
  <div>
    ${innerEmailContentHtml}
  </div>
</body>
</html>`;

      await copyFormattedContentToClipboard(fullEmailBodyHtml);

      openEmailClient(consolidatedSubject);
      notify("success", "Correo copiado. Pégalo en el cuerpo del mensaje con Ctrl+V.", 7000);

      setShowOrderActionsModal(false);
      setSearchTerm("");
      setCommittedSearchTerm("");
      // ── v51.2: el ref debe resetearse junto con el estado. Antes quedaba con el
      // Mail ID buscado y el nuevo borrador heredaba el "modo búsqueda" (sin
      // precarga por proveedor y con Preview/Send por la rama equivocada).
      committedSearchTermRef.current = "";
      // ── v51.2: liberar la presencia del Mail ID enviado (igual que handleClearSearch).
      // clearPresence maneja sus propios errores; no se espera para no demorar la UI.
      if (presenceMailId) {
        clearPresence(presenceMailId);
        if (presenceUnsubscribeRef.current) {
          presenceUnsubscribeRef.current();
          presenceUnsubscribeRef.current = null;
        }
        setPresenceMailId(null);
        setOtherUsersPresent([]);
      }
      setEmailActionTriggered(false);
      setIsShowingPreview(false);
      setPreviewHtmlContent("");

      // Optimistically update allOrdersFromFirestore with just-sent orders
      // so sentHistory badge/panel refreshes immediately
      setAllOrdersFromFirestore((prev) => {
        const notSentYet = prev.filter((o) => o.header?.status !== "sent");
        const nowSent = ordersToProcess.map((o) => ({
          ...o,
          header: { ...o.header, status: "sent", lastModifiedBy: userId },
        }));
        const alreadySent = prev.filter((o) => o.header?.status === "sent");
        return [...notSentYet, ...nowSent, ...alreadySent];
      });

      await loadMyDrafts({ silent: true });
    } catch (error) {
      notify("error", "No se pudo completar el envío. Ningún dato se perdió: revisa tu conexión e inténtalo de nuevo.", 8000);
    }
  };

  const handlePreviewOrder = async () => {
    if (isPreviewing) return;
    setIsPreviewing(true);
    try {
      await handlePreviewOrderInner();
    } catch {
      notify("error", "No se pudo generar la previsualización. Inténtalo de nuevo.");
    } finally {
      if (isMountedRef.current) setIsPreviewing(false);
    }
  };

  const handlePreviewOrderInner = async () => {
    // Capture displayedOrders y headerInfo synchronously before any await.
    // headerInfo se captura del estado React (no del ref) por el mismo motivo
    // que en performSendEmail: el SENT MODE GUARD puede dejar el ref desactualizado.
    const displayedOrdersSnapshot = displayedOrders;
    const headerInfoSnapshot = { ...headerInfo };

    // Force blur so pending onBlur formatters run before reading refs
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
      await new Promise((r) => setTimeout(r, 0));
    }
    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
      pendingSaveTimeout.current = null;
    }

    // Para items usamos el ref (siempre actualizado).
    // Para el header usamos el snapshot del estado React.
    const latestItems  = orderItemsRef.current;
    const latestHeader = headerInfoSnapshot;

    const previewGlobalId = latestHeader.mailId;

    if (!previewGlobalId) {
      setPreviewHtmlContent(
        '<p style="text-align: center; color: #888;">No hay pedidos para previsualizar sin un ID de Mail asociado.</p>'
      );
      setIsShowingPreview(true);
      return;
    }

    let ordersForPreview;

    if (committedSearchTermRef.current) {
      // ── SENT MODE: use displayedOrdersSnapshot (captured before awaits) — never stale.
      ordersForPreview = displayedOrdersSnapshot
        .filter((o) => o.header?.status !== "deleted")
        .map((o) => o.id === activeOrderIdRef.current
          ? { ...o, header: { ...latestHeader }, items: latestItems.map(i => ({ ...i })) }
          : { ...o }
        );
    } else {
      // ── DRAFT MODE: query Firestore to group drafts by mailId, then merge local state
      const ordersCollectionRef = collection(
        db,
        `artifacts/${appId}/public/data/pedidos`
      );

      const currentProveedor = latestHeader.reDestinatarios;
      if (currentProveedor && previewGlobalId) {
        const ordersToGroupQuery = query(
          ordersCollectionRef,
          where("header.status", "==", "draft"),
          where("header.reDestinatarios", "==", currentProveedor)
        );
        const ordersToGroupSnapshot = await getDocs(ordersToGroupQuery);
        const batch = writeBatch(db);
        let mutationCount = 0;

        ordersToGroupSnapshot.docs.forEach((docSnapshot) => {
          const orderData = docSnapshot.data();
          const existingMailId = orderData.header?.mailId;
          const docCreatedBy = orderData.header?.createdBy;

          if (docCreatedBy !== userId) return;

          if (!existingMailId || existingMailId !== previewGlobalId) {
            const orderRef = doc(
              db,
              `artifacts/${appId}/public/data/pedidos`,
              docSnapshot.id
            );
            batch.update(orderRef, { "header.mailId": previewGlobalId });
            mutationCount++;
          }
        });

        if (mutationCount > 0) {
          await batch.commit();
        }
      }

      const q = query(
        ordersCollectionRef,
        where("header.mailId", "==", previewGlobalId)
      );
      const querySnapshot = await getDocs(q);

      // v51.6: parser tolerante (un items corrupto ya no aborta la previsualización)
      ordersForPreview = parseFirestoreOrders(querySnapshot.docs);

      ordersForPreview = ordersForPreview.filter(
        (order) => order.header?.status !== "deleted"
      );

      const activeOrderCurrentState = {
        id: activeOrderId,
        header: { ...latestHeader },
        items: latestItems.map((item) => ({ ...item })),
      };

      const existingIndex = ordersForPreview.findIndex(
        (o) => o.id === activeOrderId
      );
      if (existingIndex !== -1) {
        if (activeOrderCurrentState.header?.status !== "deleted") {
          ordersForPreview[existingIndex] = activeOrderCurrentState;
        } else {
          ordersForPreview.splice(existingIndex, 1);
        }
      } else if (
        activeOrderCurrentState.id &&
        activeOrderCurrentState.header?.mailId === previewGlobalId &&
        activeOrderCurrentState.header?.status !== "deleted"
      ) {
        ordersForPreview.push(activeOrderCurrentState);
      }
    }

    ordersForPreview.sort((a, b) => {
      const dateA = a.header?.createdAt || 0;
      const dateB = b.header?.createdAt || 0;
      return dateA - dateB;
    });

    // ── FOB/FOT GLOBAL: la previsualización usa el Incoterm del pedido activo
    ordersForPreview = ordersForPreview.map((o) => ({
      ...o,
      header: { ...o.header, incoterm: latestHeader.incoterm || "FOB" },
    }));

    if (ordersForPreview.length === 0) {
      setPreviewHtmlContent(
        '<p style="text-align: center; color: #888;">No hay pedidos activos para previsualizar con este ID de Mail. Todos los pedidos asociados están eliminados o no existen.</p>'
      );
    } else {
      let innerPreviewHtml = "";

      // ── v26: compute the widest card so all cards render at the same width
      const maxWidth = Math.max(...ordersForPreview.map(o => measureOrderWidth(o.header, o.items)));

      ordersForPreview.forEach((order, index) => {
        innerPreviewHtml += `
            <div style="margin-bottom:8px;margin-left:16px;">
              <h3 style="margin:0 0 6px 0;font-size:16px;color:#2563eb;font-family:Arial,sans-serif;">Pedido #${index + 1}</h3>
            </div>
            ${generateSingleOrderHtml(order.header, order.items, index + 1, maxWidth)}
        `;
      });

      const finalPreviewHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Previsualización de Pedido</title>
</head>
<body style="margin:0;padding:16px 16px 16px 16px;background-color:#f8f8f8;font-family:Arial,sans-serif;">
  <div style="width:100%;text-align:right;margin-bottom:12px;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;color:#ef4444;">Mail ID: ${escapeHtml(previewGlobalId)}</div>
  <div>
    ${innerPreviewHtml}
  </div>
</body>
</html>`;
      setPreviewHtmlContent(finalPreviewHtml);
    }
    setIsShowingPreview(true);
  };

  const handleFinalizeOrder = async () => {
    // Force blur so any pending onBlur formatters run before reading refs
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
      await new Promise((r) => setTimeout(r, 0));
    }
    if (pendingSaveTimeout.current) {
      clearTimeout(pendingSaveTimeout.current);
      pendingSaveTimeout.current = null;
    }
    // Update local state only — do NOT write to Firestore here.
    // Firestore is only updated by performSendEmail.
    const snapshotHeader = headerInfoRef.current;
    const snapshotItems  = orderItemsRef.current;
    if (activeOrderIdRef.current) {
      setDisplayedOrders((prev) =>
        prev.map((o) => o.id === activeOrderIdRef.current
          ? { ...o, header: { ...snapshotHeader }, items: snapshotItems.map(i => ({ ...i })) }
          : o
        )
      );
    }

    // Read mailId from ref (not stale closure)
    let mailIdToAssign = headerInfoRef.current.mailId;
    if (!mailIdToAssign) {
      mailIdToAssign = crypto.randomUUID().substring(0, 8).toUpperCase();
      setHeaderInfo((prev) => ({ ...prev, mailId: mailIdToAssign }));
    }

    setShowOrderActionsModal(true);
    setEmailActionTriggered(false);
    setIsShowingPreview(false);
    setPreviewHtmlContent("");
  };

  const handleOpenObservationModal = (itemId) => {
    const itemToEdit = orderItems.find((item) => item.id === itemId);
    if (itemToEdit) {
      setCurrentEditingItemData(itemToEdit);
      setModalObservationText(itemToEdit.estado);
      setShowObservationModal(true);
    }
  };

  useEffect(() => {
    if (showObservationModal && observationTextareaRef.current) {
      observationTextareaRef.current.focus();
      if (observationTextareaRef.current.value) {
        observationTextareaRef.current.select();
      }
    }
  }, [showObservationModal]);

  const handleSaveObservation = () => {
    if (currentEditingItemData) {
      const formattedObservation = modalObservationText
        ? modalObservationText.charAt(0).toUpperCase() +
          modalObservationText.slice(1).toLowerCase()
        : "";

      const updatedItems = orderItems.map((item) =>
        item.id === currentEditingItemData.id
          ? { ...item, estado: formattedObservation }
          : item
      );
      setOrderItems(updatedItems);
      // ── v22 FIX: use refs instead of stale headerInfo closure
      saveOrderToFirestore({
        id: activeOrderIdRef.current,
        header: { ...headerInfoRef.current },
        items: updatedItems,
        rowAction: true, // v51.4
      }).catch(() => {});
    }
    setShowObservationModal(false);
    setCurrentEditingItemData(null);
    setModalObservationText("");
  };

  const handleCloseObservationModal = () => {
    setShowObservationModal(false);
    setCurrentEditingItemData(null);
    setModalObservationText("");
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      let isHandled = false;

      const isOurInput = (element) => {
        return (
          element.tagName === "INPUT" &&
          element.name &&
          (headerInputOrder.includes(element.name) ||
            tableColumnOrder.includes(element.name))
        );
      };

      if (!isOurInput(activeElement)) {
        return;
      }

      const headerIndex = headerInputOrder.indexOf(activeElement.name);
      let tablePosition = null;
      if (headerIndex === -1) {
        for (const rowId in tableInputRefs.current) {
          for (const colName in tableInputRefs.current[rowId]) {
            if (tableInputRefs.current[rowId][colName] === activeElement) {
              tablePosition = { rowId, colName };
              break;
            }
          }
          if (tablePosition) break;
        }
      }

      // v52: ← → solo saltan de campo si el cursor está al inicio/final del
      // texto (antes impedían mover el cursor para corregir una palabra).
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        typeof activeElement.selectionStart === "number"
      ) {
        const { selectionStart: selStart, selectionEnd: selEnd, value: text } = activeElement;
        if (selStart !== selEnd) return;
        if (e.key === "ArrowLeft" && selStart > 0) return;
        if (e.key === "ArrowRight" && selStart < text.length) return;
      }

      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();

        if (headerIndex !== -1) {
          let nextIndex = headerIndex;
          if (e.key === "ArrowRight") {
            nextIndex = (headerIndex + 1) % headerInputOrder.length;
          } else if (e.key === "ArrowLeft") {
            nextIndex =
              (headerIndex - 1 + headerInputOrder.length) %
              headerInputOrder.length;
          } else if (e.key === "ArrowDown") {
            if (orderItemsRef.current.length > 0) {
              const firstRowId = orderItemsRef.current[0].id;
              const firstColName = tableColumnOrder[0];
              if (
                tableInputRefs.current[firstRowId] &&
                tableInputRefs.current[firstRowId][firstColName]
              ) {
                tableInputRefs.current[firstRowId][firstColName].focus();
                isHandled = true;
              }
            }
          } else if (e.key === "ArrowUp") {
            nextIndex =
              (headerIndex - 1 + headerInputOrder.length) %
              headerInputOrder.length;
            if (headerInputRefs.current[headerInputOrder[nextIndex]]) {
              headerInputRefs.current[headerInputOrder[nextIndex]].focus();
              isHandled = true;
            }
          }
          if (
            !isHandled &&
            headerInputRefs.current[headerInputOrder[nextIndex]]
          ) {
            headerInputRefs.current[headerInputOrder[nextIndex]].focus();
            isHandled = true;
          }
        } else if (tablePosition) {
          const { rowId, colName } = tablePosition;
          const currentRowIndex = orderItemsRef.current.findIndex(
            (item) => item.id === rowId
          );
          const currentColIndex = tableColumnOrder.indexOf(colName);

          let targetRowIndex = currentRowIndex;
          let targetColIndex = currentColIndex;

          if (e.key === "ArrowRight") {
            targetColIndex++;
            if (targetColIndex >= tableColumnOrder.length) {
              targetColIndex = 0;
              targetRowIndex++;
            }
          } else if (e.key === "ArrowLeft") {
            targetColIndex--;
            if (targetColIndex < 0) {
              targetColIndex = tableColumnOrder.length - 1;
              targetRowIndex--;
            }
          }
          else if (e.key === "ArrowDown") {
            targetRowIndex++;
          } else if (e.key === "ArrowUp") {
            targetRowIndex--;
          }

          let nextElementToFocus = null;

          if (targetRowIndex >= 0 && targetRowIndex < orderItemsRef.current.length) {
            const targetRowId = orderItemsRef.current[targetRowIndex]?.id;
            const targetColName = tableColumnOrder[targetColIndex];
            if (
              tableInputRefs.current[targetRowId] &&
              tableInputRefs.current[targetRowId][targetColName]
            ) {
              nextElementToFocus =
                tableInputRefs.current[targetRowId][targetColName];
            }
          } else if (targetRowIndex < 0) {
            const lastHeaderInputName =
              headerInputOrder[headerInputOrder.length - 1];
            nextElementToFocus = headerInputRefs.current[lastHeaderInputName];
          } else if (targetRowIndex >= orderItemsRef.current.length) {
            const lastValidRowIndex = orderItemsRef.current.length - 1;
            const lastValidRowId = orderItemsRef.current[lastValidRowIndex]?.id;
            const targetColName = tableColumnOrder[currentColIndex];
            if (
              lastValidRowId &&
              tableInputRefs.current[lastValidRowId] &&
              tableInputRefs.current[lastValidRowId][targetColName]
            ) {
              nextElementToFocus =
                tableInputRefs.current[lastValidRowId][targetColName];
            }
          }

          if (nextElementToFocus) {
            nextElementToFocus.focus();
            isHandled = true;
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const currentOrderIsDeleted = headerInfo.status === "deleted";

  // ── v52: datos derivados para la interfaz ─────────────────────────────────
  const STATUS_META = {
    draft: { tone: "neutral", label: "Borrador" },
    sent: { tone: "success", label: "Enviado" },
    deleted: { tone: "danger", label: "Eliminado" },
  };
  const statusMeta = STATUS_META[headerInfo.status] || { tone: "neutral", label: headerInfo.status || "—" };
  const proveedorLocked = currentOrderIsDeleted || (currentOrderIndex > 0 && !!headerInfo.reDestinatarios);
  const formatPallets = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const emailClientLabel = { auto: "Outlook (detección automática)", desktop: "Outlook Desktop", web: "Outlook Web" }[emailClientPref] || "tu correo";

  // v52.1: resumen de un pedido para el navegador (especies y pallets no cancelados)
  const orderSummary = (items) => {
    const list = Array.isArray(items) ? items : [];
    const especies = [...new Set(list.map((it) => normalizeSpeciesName(it.especie)).filter(Boolean))];
    const pallets = list.reduce((acc, it) => (it.isCanceled ? acc : acc + Math.max(0, parseFloat(it.pallets) || 0)), 0);
    return { especies, pallets };
  };

  // v52.1: traduce el código de error de Firebase a una acción concreta
  const diagnoseError = (err) => {
    const code = String(err?.code || "");
    const msg = String(err?.message || "");
    if (!err) return "No hay sesión activa. Revisa que el inicio de sesión Anónimo esté habilitado en Firebase (Authentication → Método de acceso).";
    if (/configuration-not-found/.test(code))
      return "Authentication no está activado en este proyecto de Firebase. En Firebase: Authentication → Comenzar → Método de acceso → Anónimo → Habilitar.";
    if (/admin-restricted-operation|operation-not-allowed/.test(code))
      return "El inicio de sesión Anónimo no está habilitado. En Firebase: Authentication → Método de acceso → Anónimo → Habilitar.";
    if (/invalid-api-key|api-key-not-valid/.test(code + msg))
      return "La configuración de Firebase no es válida. Revisa las variables VITE_FIREBASE_* del repositorio.";
    if (/permission-denied/.test(code))
      return `Las reglas de Firestore rechazaron la operación. Revisa que las reglas publicadas usen el ID de proyecto "${firebaseConfig.projectId}".`;
    if (/not-found|failed-precondition/.test(code) && /database/i.test(msg))
      return "No existe la base de datos de Firestore en este proyecto. En Firebase: Firestore Database → Crear base de datos.";
    if (/unavailable|timeout|deadline-exceeded|network/.test(code))
      return "El servidor no respondió. Revisa tu conexión a internet; si persiste, verifica que Firestore esté creado en el proyecto.";
    return msg || "Error desconocido al comunicarse con Firebase.";
  };

  const copyMailId = async () => {
    const id = headerInfo.mailId;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      notify("success", <>Mail ID <strong className="font-mono">{id}</strong> copiado.</>, 2500);
    } catch {
      notify("info", <>Mail ID: <strong className="font-mono">{id}</strong></>, 4000);
    }
  };

  // v52.4: "Limpiar búsqueda" sin búsqueda activa descarta el borrador (crea un Mail ID
  // nuevo). Si hay datos escritos, se pide confirmación para no perderlos por error.
  const confirmClearSearch = async () => {
    const hasDraftData =
      !committedSearchTerm &&
      displayedOrders.some((o, i) => {
        const h = i === currentOrderIndex ? headerInfo : o.header || {};
        const items = i === currentOrderIndex ? orderItems : o.items || [];
        return (
          ["reDestinatarios", "deNombrePais", "nave", "fechaCarga", "exporta"].some((k) => String(h[k] || "").trim()) ||
          items.some((it) => ["pallets", "especie", "variedad", "formato", "calibre", "categoria", "preciosFOB", "estado"].some((k) => String(it[k] || "").trim()))
        );
      });
    if (hasDraftData) {
      const ok = await askConfirm({
        title: "¿Descartar el borrador actual?",
        message: `No hay una búsqueda activa: “Limpiar búsqueda” descarta los ${displayedOrders.length} pedido(s) en borrador y crea un Mail ID nuevo. Los pedidos enviados no se modifican.`,
        confirmLabel: "Descartar borrador",
        danger: true,
      });
      if (!ok) return;
    }
    handleClearSearch();
  };

  const confirmDeleteOrder = async () => {
    const ok = await askConfirm({
      title: `¿Eliminar el Pedido ${currentOrderIndex + 1}?`,
      message: "El pedido se quitará de este Mail ID y no aparecerá en el correo. Esta acción no se puede deshacer desde la app.",
      confirmLabel: "Eliminar pedido",
      danger: true,
    });
    if (ok) {
      await handleDeleteCurrentOrder();
      notify("success", "Pedido eliminado.", 2500);
    }
  };

  const confirmReloadSession = async () => {
    const ok = await askConfirm({
      title: "¿Recargar la aplicación?",
      message: "Se recargará la página y se descartarán los borradores sin enviar. Los pedidos enviados no se modifican.",
      confirmLabel: "Recargar",
      danger: true,
    });
    if (ok) window.location.reload();
  };

  const saveIndicator =
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Spinner className="h-3.5 w-3.5" />Guardando…</span>
    ) : saveState === "error" ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger"><Icon name="warning" className="h-4 w-4" />Sin guardar</span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-success"><Icon name="check" className="h-4 w-4" />Guardado</span>
    ) : null;

  const vpcLogo = (
    <img
      src="https://www.vpcom.com/images/logo-vpc.png"
      onError={(e) => {
        e.target.onerror = null;
        e.target.src = `${import.meta.env.BASE_URL}logo4.png`;
      }}
      alt="VPC"
      width="96"
      height="32"
      className="h-8 w-auto max-w-[96px] shrink-0 object-contain dark:rounded-md dark:bg-white dark:px-1.5 dark:py-0.5"
    />
  );

  // ── v52.5: menú de perfil ──────────────────────────────────────────────
  const connectionOk = !!userId && !authError && saveState !== "error";
  const userShort = userId ? userId.substring(0, 8).toUpperCase() : "—";
  const closeMenu = () => setShowConfigPanel(false);
  const menuItem = ({ icon, label, hint, right, onClick, disabled = false }) => (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-fg-2 transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name={icon} className="h-[18px] w-[18px] shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      {right}
    </button>
  );
  const segment = (options, value, onPick, ariaLabel) => (
    <div role="group" aria-label={ariaLabel} className="grid gap-1 rounded-lg bg-surface-3 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            aria-label={o.aria || o.label}
            title={o.title || o.label}
            onClick={() => onPick(o.value)}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
              active ? "bg-surface text-primary shadow-xs" : "text-muted hover:text-fg"
            }`}
          >
            {o.icon && <Icon name={o.icon} className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
  const EMAIL_CLIENT_OPTIONS = [
    { value: "auto", label: "Automático", title: "Intenta Outlook Desktop y, si no está instalado, abre Outlook Web", desc: "Intenta Outlook Desktop; si no está, abre Outlook Web." },
    { value: "desktop", label: "Desktop", title: "Siempre la aplicación de Outlook", desc: "Siempre abre la aplicación de Outlook instalada." },
    { value: "web", label: "Web", title: "Siempre outlook.office.com", desc: "Siempre abre outlook.office.com en el navegador." },
  ];

  const profileMenu = (
    <div className="relative">
      <button
        ref={avatarRef}
        type="button"
        onClick={() => setShowConfigPanel((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={showConfigPanel}
        aria-label="Mi perfil y ajustes"
        title="Mi perfil y ajustes"
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary ring-1 ring-primary-line transition hover:ring-2 hover:ring-primary"
      >
        <Icon name="user" className="h-5 w-5" />
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface ${connectionOk ? "bg-success" : "bg-danger"}`}
          title={connectionOk ? "Conectado" : "Sin conexión"}
        />
      </button>

      {showConfigPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} aria-hidden="true" />
          <div
            role="menu"
            aria-label="Perfil y ajustes"
            style={{ left: menuLeft }}
            className="absolute top-11 z-50 max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
          >
            {/* Perfil + estado */}
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
                <Icon name="user" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg" title={userId || undefined}>Usuario {userShort}</p>
                <p className={`flex items-center gap-1.5 text-xs ${connectionOk ? "text-success" : "text-danger"}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                  <span className="shrink-0 whitespace-nowrap">{connectionOk ? "Conectado" : "Sin conexión"}</span>
                  <span className="min-w-0 truncate font-mono text-muted">· {firebaseConfig.projectId || "sin configurar"}</span>
                </p>
              </div>
            </div>
            {(authError || connError) && (
              <div className="border-b border-line bg-danger-soft px-4 py-2.5 text-xs">
                <p className="font-mono break-all text-danger">{(authError || connError).code}</p>
                <p className="mt-1 text-fg-2">{diagnoseError(authError || connError)}</p>
              </div>
            )}

            {/* Accesos */}
            <div className="py-1">
              {menuItem({
                icon: "sparkles",
                label: "Novedades de la versión",
                hint: `${APP_VERSION} · ${APP_VERSION_DATE}`,
                onClick: () => { closeMenu(); setShowWhatsNew(true); },
              })}
            </div>

            {/* Preferencias */}
            <div className="space-y-3 border-t border-line px-4 py-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Tema</p>
                {segment(
                  [
                    { value: "light", label: "Claro", aria: "Modo claro", icon: "sun" },
                    { value: "dark", label: "Oscuro", aria: "Modo oscuro", icon: "moon" },
                  ],
                  darkMode ? "dark" : "light",
                  (v) => { if ((v === "dark") !== darkMode) toggleDarkMode(); },
                  "Tema"
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Abrir el correo con Outlook</p>
                {segment(EMAIL_CLIENT_OPTIONS, emailClientPref, saveEmailClientPref, "Cliente de correo")}
                <p className="mt-1.5 text-[11px] leading-snug text-muted">
                  {(EMAIL_CLIENT_OPTIONS.find((o) => o.value === emailClientPref) || EMAIL_CLIENT_OPTIONS[0]).desc}
                </p>
              </div>
            </div>

            {/* Sesión */}
            <div className="border-t border-line py-1">
              {menuItem({
                icon: "refresh",
                label: "Recargar aplicación",
                hint: "Descarta los borradores sin enviar",
                onClick: () => { closeMenu(); confirmReloadSession(); },
              })}
            </div>
            <div className="flex justify-between border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-subtle">
              <span>{APP_VERSION} · {APP_VERSION_DATE}</span>
              <span>Preferencias de este dispositivo</span>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const envBanner = ENV_LABEL ? (
    <div role="status" className="border-b border-warning-line bg-warning-soft px-3 py-1.5 text-center text-xs font-semibold text-warning">
      Entorno de {ENV_LABEL.toLowerCase()} · base de datos: <span className="font-mono">{firebaseConfig.projectId || "sin configurar"}</span> · no usar para pedidos reales
    </div>
  ) : null;

  // ── Pantalla de carga (misma geometría que la interfaz real: sin saltos) ──
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        {envBanner}
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-6">
            <div className="h-8 w-24 animate-pulse rounded-md bg-surface-3" />
            <div className="h-4 w-48 animate-pulse rounded bg-surface-3" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-3 pt-4 sm:px-6 sm:pt-6" aria-busy="true">
          <div className="h-[132px] animate-pulse rounded-2xl border border-line bg-surface" />
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <div className="h-6 w-40 animate-pulse rounded bg-surface-3" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-20 animate-pulse rounded bg-surface-3" />
                  <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
                </div>
              ))}
            </div>
            <div className="h-32 animate-pulse rounded-lg bg-surface-2" />
          </div>
        </main>
      </div>
    );
  }

  // Campos de la tabla (escritorio y móvil comparten definición)
  const ITEM_FIELDS = [
    { name: "pallets", label: "Pallets", placeholder: "21", type: "number", inputMode: "decimal", width: "w-20" },
    { name: "especie", label: "Especie", placeholder: "Manzana", apple: true },
    { name: "variedad", label: "Variedad", placeholder: "Gala", apple: true },
    { name: "formato", label: "Formato", placeholder: "20 Kg" },
    { name: "calibre", label: "Calibre", placeholder: "100;113" },
    { name: "categoria", label: "Categoría", placeholder: "PRE:XFY" },
    { name: "preciosFOB", label: `Precios ${headerInfo.incoterm || "FOB"}`, placeholder: "$14" },
  ];

  const rowActions = (item, index, compact = false) => {
    // v52.3: en escritorio íconos más chicos (xs) para filas más bajas
    const sz = compact ? "sm" : "xs";
    return (
    <>
      {compact && (
        <>
          <IconButton size={sz} label="Subir fila" icon="chevronUp" disabled={index === 0 || currentOrderIsDeleted} onClick={() => handleDragReorder(index, index - 1)} />
          <IconButton size={sz} label="Bajar fila" icon="chevronDown" disabled={index === orderItems.length - 1 || currentOrderIsDeleted} onClick={() => handleDragReorder(index, index + 1)} />
        </>
      )}
      {/* v52.2: la observación es por pedido → solo en la 1ª fila. En otras filas
          solo aparece si ya tienen una observación antigua (para verla o borrarla). */}
      {index === 0 || (item.estado && item.estado !== "CANCELADO") ? (
        <IconButton
          size={sz}
          icon="note"
          tone="primary"
          className={item.estado && item.estado !== "CANCELADO" ? "bg-primary-soft" : ""}
          label={item.estado && item.estado !== "CANCELADO" ? `Observación del pedido: ${item.estado}` : "Agregar observación del pedido"}
          onClick={() => handleOpenObservationModal(item.id)}
          disabled={currentOrderIsDeleted}
        />
      ) : (
        <span className={`${compact ? "h-8 w-8" : "h-7 w-7"} shrink-0`} aria-hidden="true" />
      )}
      <IconButton size={sz} icon="plus" tone="success" label="Duplicar fila" onClick={() => handleAddItem(item.id)} disabled={currentOrderIsDeleted} />
      <IconButton
        size={sz}
        icon={item.isCanceled ? "undo" : "ban"}
        tone="warning"
        label={item.isCanceled ? "Revertir cancelación" : "Cancelar fila"}
        onClick={() => toggleItemCancellation(item.id)}
        disabled={currentOrderIsDeleted}
      />
      <IconButton
        size={sz}
        icon="trash"
        tone="dangerSolid"
        label={orderItems.length <= 1 ? "No se puede eliminar la última fila" : "Eliminar fila"}
        onClick={() => handleDeleteItem(item.id)}
        disabled={orderItems.length <= 1 || currentOrderIsDeleted}
      />
    </>
    );
  };

  const tableInputProps = (item, field) => ({
    name: field.name,
    type: field.type || "text",
    inputMode: field.inputMode,
    value: item[field.name],
    placeholder: field.placeholder,
    onChange: (e) => handleItemChange(item.id, e),
    onFocus: handleFocusField,
    onBlur: handleBlurField((e) => handleItemBlur(item.id, e)),
    readOnly: item.isCanceled || currentOrderIsDeleted,
    isCanceledProp: item.isCanceled || currentOrderIsDeleted,
    ...(field.apple && isAppleSpecies(item.especie) ? { list: "apple-varieties" } : {}),
  });

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      {envBanner}

      {/* ── BARRA SUPERIOR ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:px-6">
          {vpcLogo}
          <div className="min-w-0 flex-1 border-l border-line pl-3">
            <h1 className="truncate text-sm font-semibold text-fg sm:text-base">Pedidos Comercial Frutam</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* v52.7: historial como reloj circular con la cantidad de envíos */}
            <button
              type="button"
              onClick={() => setShowHistoryPanel(true)}
              aria-label={`Historial de envíos (${sentHistory.length})`}
              title={sentHistory.length ? `Historial: ${sentHistory.length} envío${sentHistory.length > 1 ? "s" : ""}` : "Historial de envíos (vacío)"}
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-fg-2 ring-1 ring-line transition hover:text-primary hover:ring-2 hover:ring-primary"
            >
              <Icon name="clock" className="h-5 w-5" />
              {sentHistory.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-primary px-1 text-[10px] font-bold text-primary-fg">
                  {sentHistory.length}
                </span>
              )}
            </button>
            {profileMenu}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-3 pt-4 pb-6 sm:px-6 sm:pt-6">
        {/* ── BÚSQUEDA + ESTADO DEL MAIL ID ────────────────────────────────── */}
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs sm:p-5">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchClick();
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="searchTerm" className="label">Buscar por Mail ID</label>
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
                <input
                  type="text"
                  id="searchTerm"
                  name="searchTerm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ej. 5B7D7692"
                  className="field pl-9 font-mono uppercase placeholder:normal-case"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={12}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" icon="search" loading={isSearching} className="flex-1 sm:flex-none">
                Buscar
              </Button>
              <Button variant="secondary" onClick={confirmClearSearch} className="flex-1 sm:flex-none">
                Limpiar búsqueda
              </Button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
            <span className="text-xs font-medium text-muted">Mail ID</span>
            <button
              type="button"
              onClick={copyMailId}
              disabled={!headerInfo.mailId}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 font-mono text-sm font-semibold text-fg transition-colors hover:bg-line"
              title="Copiar Mail ID"
              aria-label={`Copiar Mail ID ${headerInfo.mailId || ""}`}
            >
              {headerInfo.mailId || "—"}
              <Icon name="copy" className="h-3.5 w-3.5 text-muted" />
            </button>
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            {committedSearchTerm && <Badge tone="primary">Recuperado por búsqueda</Badge>}
            <span className="ml-auto">{saveIndicator}</span>
          </div>
        </section>

        {/* ── v52.1: DIAGNÓSTICO DE CONEXIÓN ───────────────────────────────── */}
        {(authError || (connError && saveState === "error") || (!isLoading && isAuthReady && !userId)) && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm">
            <div className="flex items-start gap-3">
              <Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-danger">No se pudo {authError || !userId ? "iniciar sesión en" : "guardar en"} la base de datos</p>
                <p className="text-fg-2">{diagnoseError(authError || connError)}</p>
                <p className="font-mono text-xs break-all text-muted">
                  Código: {(authError || connError)?.code || "sin sesión"} · Proyecto: {firebaseConfig.projectId || "sin configurar"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── AVISOS CONTEXTUALES ──────────────────────────────────────────── */}
        {otherUsersPresent.length > 0 && committedSearchTerm && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm">
            <Icon name="users" className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p className="text-fg-2">
              <strong className="text-fg">{otherUsersPresent.join(", ")}</strong>{" "}
              {otherUsersPresent.length === 1 ? "también está" : "también están"} editando este Mail ID ahora mismo. Los cambios podrían solaparse.
            </p>
          </div>
        )}

        {proveedorSuggestion && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary-line bg-primary-soft px-4 py-3 text-sm sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Icon name="bulb" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="min-w-0 text-fg-2">
                <strong className="text-fg">Último pedido a {proveedorSuggestion.proveedor}:</strong>{" "}
                {[...new Set(proveedorSuggestion.items.map((i) => i.especie).filter(Boolean))].join(", ")}
                {proveedorSuggestion.nave ? ` · ${proveedorSuggestion.nave}` : ""}
                {proveedorSuggestion.deNombrePais ? ` · ${proveedorSuggestion.deNombrePais}` : ""}
              </p>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              <Button size="sm" variant="primary" onClick={applyProveedorSuggestion}>Precargar</Button>
              <Button size="sm" variant="ghost" onClick={dismissProveedorSuggestion}>Descartar</Button>
            </div>
          </div>
        )}

        {/* ── PEDIDO ACTIVO ────────────────────────────────────────────────── */}
        {displayedOrders.length === 0 && committedSearchTerm ? (
          <section className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <Icon name="search" className="mx-auto h-8 w-8 text-subtle" />
            <p className="mt-3 font-semibold text-fg">
              No se encontraron pedidos con el Mail ID <span className="font-mono">{committedSearchTerm}</span>
            </p>
            <p className="mt-1 text-sm text-muted">Revisa el código o usa “Limpiar búsqueda” para volver a tu borrador.</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-line bg-surface shadow-xs">
            {/* v52.1: navegador de pedidos — pensado para Mail ID con 15+ pedidos */}
            <div className="space-y-3 border-b border-line bg-surface-2 px-3 py-3 sm:px-5 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="chevronLeft"
                  onClick={() => goToOrder(currentOrderIndex - 1)}
                  disabled={currentOrderIndex === 0}
                  aria-label="Pedido anterior"
                  title="Pedido anterior"
                >
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                <div className="min-w-0 flex-1 text-center" aria-live="polite">
                  <p className="text-base leading-tight font-semibold text-fg sm:text-lg">
                    {displayedOrders.length === 0 ? (
                      <span className="text-muted">Sin pedidos cargados</span>
                    ) : (
                      <>
                        Pedido <span className="text-primary">{currentOrderIndex + 1}</span>
                        <span className="font-normal text-muted"> de {displayedOrders.length}</span>
                      </>
                    )}
                    {currentOrderIsDeleted && <span className="ml-2 text-sm font-semibold text-danger">(Eliminado)</span>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => goToOrder(currentOrderIndex + 1)}
                  disabled={currentOrderIndex >= displayedOrders.length - 1}
                  aria-label="Pedido siguiente"
                  title="Pedido siguiente"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <Icon name="chevronRight" className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {displayedOrders.map((o, i) => {
                  const active = i === currentOrderIndex;
                  const sum = orderSummary(active ? orderItems : o.items);
                  const sent = o.header?.status === "sent";
                  return (
                    <button
                      key={o.id}
                      type="button"
                      data-order-chip
                      aria-current={active ? "true" : undefined}
                      aria-label={`Ir al pedido ${i + 1}`}
                      title={`Pedido ${i + 1} · ${sum.especies.join(", ") || "sin especie"} · ${formatPallets(sum.pallets)} pallets${sent ? " · enviado" : ""}`}
                      onClick={() => goToOrder(i)}
                      className={`relative h-8 min-w-8 rounded-lg border px-2 text-sm font-semibold tabular-nums transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-fg shadow-xs"
                          : "border-line-strong bg-surface text-fg-2 hover:border-primary hover:text-primary"
                      }`}
                    >
                      {i + 1}
                      {sent && !active && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" />}
                    </button>
                  );
                })}
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={handleAddOrder}
                  loading={addingOrder}
                  disabled={currentOrderIsDeleted}
                  className="ml-auto"
                  title="Agrega otro pedido a este mismo Mail ID"
                >
                  Agregar pedido
                </Button>
              </div>
            </div>

            {/* Encabezado del pedido */}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              <div className="min-w-0">
                {/* v52.1: misma altura (h-6) que las demás etiquetas; el selector no toca el campo */}
                <div className="mb-1.5 flex h-6 items-center justify-between gap-2">
                  <label htmlFor="reDestinatarios" className="label mb-0">Proveedor</label>
                  <div role="group" aria-label="Incoterm" className={`inline-flex overflow-hidden rounded-md border border-line-strong ${currentOrderIsDeleted ? "pointer-events-none opacity-50" : ""}`}>
                    {["FOB", "FOT"].map((term) => {
                      const active = headerInfo.incoterm === term;
                      return (
                        <button
                          key={term}
                          type="button"
                          aria-pressed={active}
                          onClick={() => { if (!currentOrderIsDeleted) handleIncotermChange(term); }}
                          disabled={currentOrderIsDeleted}
                          title={`Precios ${term} para todos los pedidos de este Mail ID`}
                          className={`px-2.5 py-0.5 text-xs leading-4 font-semibold transition-colors ${active ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:bg-surface-2 hover:text-fg"}`}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="text"
                  id="reDestinatarios"
                  name="reDestinatarios"
                  value={headerInfo.reDestinatarios === null || headerInfo.reDestinatarios === undefined ? "" : String(headerInfo.reDestinatarios)}
                  onFocus={handleFocusField}
                  onBlur={handleBlurField(handleHeaderBlur)}
                  onChange={(e) => {
                    handleHeaderChange(e);
                    const val = e.target.value;
                    if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
                    lookupDebounceRef.current = setTimeout(() => {
                      lookupLastOrderForProveedor(val);
                    }, 600);
                  }}
                  placeholder="Nombre del proveedor"
                  className="field"
                  ref={(el) => (headerInputRefs.current.reDestinatarios = el)}
                  readOnly={proveedorLocked}
                  title={proveedorLocked && !currentOrderIsDeleted ? "El proveedor se define en el primer pedido del Mail ID" : undefined}
                  autoComplete="off"
                />
              </div>
              <InputField label="País" name="deNombrePais" value={headerInfo.deNombrePais} onChange={handleHeaderChange} onFocus={handleFocusField} onBlur={handleBlurField(handleHeaderBlur)} placeholder="País de destino" ref={(el) => (headerInputRefs.current.deNombrePais = el)} readOnly={currentOrderIsDeleted} />
              <InputField label="Nave" name="nave" value={headerInfo.nave} onChange={handleHeaderChange} onFocus={handleFocusField} onBlur={handleBlurField(handleHeaderBlur)} placeholder="Nombre de la nave" ref={(el) => (headerInputRefs.current.nave = el)} readOnly={currentOrderIsDeleted} />
              <InputField label="Fecha de carga" name="fechaCarga" type="date" value={headerInfo.fechaCarga} onChange={handleHeaderChange} onFocus={handleFocusField} onBlur={handleBlurField(handleHeaderBlur)} ref={(el) => (headerInputRefs.current.fechaCarga = el)} readOnly={currentOrderIsDeleted} />
              <InputField label="Exporta" name="exporta" value={headerInfo.exporta} onChange={handleHeaderChange} onFocus={handleFocusField} onBlur={handleBlurField(handleHeaderBlur)} placeholder="Exportadora" ref={(el) => (headerInputRefs.current.exporta = el)} readOnly={currentOrderIsDeleted} />
              <InputField label="Asunto del email (automático)" name="emailSubject" value={headerInfo.emailSubject} onChange={handleHeaderChange} onBlur={handleHeaderBlur} ref={(el) => (headerInputRefs.current.emailSubject = el)} readOnly={true} className="font-mono text-xs" />
            </div>

            {/* Detalle */}
            <div className="border-t border-line">
              <div className="flex items-center gap-1 px-4 py-3 sm:px-5">
                <h2 className="text-sm font-semibold text-fg">Detalle del pedido</h2>
                <div className="relative">
                  <IconButton
                    size="sm"
                    icon="info"
                    label="¿Qué hace cada acción de fila?"
                    aria-expanded={showRowHelp}
                    onClick={() => setShowRowHelp((v) => !v)}
                  />
                  {showRowHelp && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowRowHelp(false)} aria-hidden="true" />
                      <div role="dialog" aria-label="Acciones de fila" className="absolute top-9 left-0 z-40 w-80 max-w-[calc(100vw-2rem)] space-y-2.5 rounded-xl border border-line bg-surface p-4 text-xs shadow-lg">
                        <p className="text-sm font-semibold text-fg">Acciones de fila</p>
                        {[
                          { icon: "note", cls: "text-primary", t: "Observación del pedido", d: "Solo en la primera fila. Aparece en “Observaciones” del correo." },
                          { icon: "plus", cls: "text-success", t: "Duplicar", d: "Agrega una copia de la fila justo debajo (sin la observación)." },
                          { icon: "ban", cls: "text-warning", t: "Cancelar / revertir", d: "La fila sale tachada en el correo y no suma pallets." },
                          { icon: "trash", cls: "text-danger", t: "Eliminar", d: "Quita la fila del pedido." },
                          { icon: "grip", cls: "text-muted", t: "Reordenar", d: "Arrastra desde la manilla (en celular, con ↑ ↓)." },
                        ].map((a) => (
                          <div key={a.t} className="flex items-start gap-2.5">
                            <Icon name={a.icon} className={`mt-0.5 h-4 w-4 shrink-0 ${a.cls}`} />
                            <p className="text-fg-2"><strong className="text-fg">{a.t}:</strong> {a.d}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Escritorio: tabla con margen dentro de la tarjeta */}
              <div className="hidden px-5 pb-5 md:block">
                <div className="overflow-x-auto rounded-lg border border-line-strong">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="bg-thead text-center text-[11px] font-semibold tracking-wide text-thead-fg uppercase">
                      <th scope="col" className="w-8 py-2 pl-3"><span className="sr-only">Mover</span></th>
                      {ITEM_FIELDS.map((f) => (
                        <th key={f.name} scope="col" className={`px-2 py-2 whitespace-nowrap ${f.width || ""}`}>{f.label}</th>
                      ))}
                      <th scope="col" className="w-36 py-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item, index) => (
                      <tr
                        key={item.id}
                        onDragEnter={() => { dragOverIndex.current = index; }}
                        onDragOver={(e) => e.preventDefault()}
                        className={`border-b border-line transition-colors ${
                          item.isCanceled || currentOrderIsDeleted ? "bg-danger-soft/60" : index % 2 === 1 ? "bg-surface-2 hover:bg-surface-3" : "bg-surface hover:bg-surface-3"
                        }`}
                      >
                        <td className="py-0.5 pl-2">
                          <span
                            draggable={!currentOrderIsDeleted}
                            onDragStart={() => { dragItemIndex.current = index; }}
                            onDragEnd={() => {
                              if (dragItemIndex.current !== null && dragOverIndex.current !== null) {
                                handleDragReorder(dragItemIndex.current, dragOverIndex.current);
                              }
                              dragItemIndex.current = null;
                              dragOverIndex.current = null;
                            }}
                            className={`flex h-7 w-6 items-center justify-center rounded text-subtle ${currentOrderIsDeleted ? "" : "cursor-grab hover:bg-surface-3 hover:text-fg active:cursor-grabbing"}`}
                            title="Arrastrar para reordenar"
                          >
                            <Icon name="grip" className="h-4 w-4" />
                          </span>
                        </td>
                        {ITEM_FIELDS.map((f) => (
                          <td key={f.name} className={`px-1 py-0.5 ${f.width || ""}`}>
                            <TableInput
                              {...tableInputProps(item, f)}
                              ariaLabel={`${f.label}, fila ${index + 1}`}
                              ref={(el) => {
                                if (!tableInputRefs.current[item.id]) tableInputRefs.current[item.id] = {};
                                tableInputRefs.current[item.id][f.name] = el;
                              }}
                            />
                          </td>
                        ))}
                        <td className="py-0.5">
                          <div className="flex items-center justify-center gap-0.5">{rowActions(item, index)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-line-strong bg-surface-3" data-testid="total-pallets">
                      <td colSpan={9} className="px-4 py-1 text-right text-sm font-bold text-fg">
                        TOTAL PALLETS: <span className="ml-1 tabular-nums">{formatPallets(currentOrderTotalPallets)}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>

              {/* Móvil: tarjetas */}
              <div className="space-y-3 px-3 pb-4 md:hidden">
                {orderItems.map((item, index) => (
                  <div key={item.id} className={`rounded-xl border border-line p-3 ${item.isCanceled || currentOrderIsDeleted ? "bg-danger-soft/50" : "bg-surface"}`}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted">
                        Fila {index + 1}
                        {item.isCanceled && <Badge tone="danger" className="ml-2">Cancelada</Badge>}
                      </span>
                      <div className="flex items-center">{rowActions(item, index, true)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ITEM_FIELDS.map((f) => (
                        <label key={f.name} className={`block min-w-0 ${f.name === "preciosFOB" ? "col-span-2" : ""}`}>
                          <span className="label">{f.label}</span>
                          <TableInput {...tableInputProps(item, f)} variant="field" />
                        </label>
                      ))}
                    </div>
                    {item.estado && item.estado !== "CANCELADO" && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted"><Icon name="note" className="h-4 w-4 shrink-0" />{item.estado}</p>
                    )}
                  </div>
                ))}
                <div className="rounded-lg bg-surface-3 px-4 py-1.5 text-right text-sm font-bold text-fg">
                  TOTAL PALLETS: <span className="ml-1 tabular-nums">{formatPallets(currentOrderTotalPallets)}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        <footer className="pt-2 pb-2 text-center text-xs text-subtle">
          {APP_VERSION} · {APP_VERSION_DATE}
        </footer>
      </main>

      {/* ── BARRA DE ACCIONES (fija abajo) ─────────────────────────────────── */}
      <div className="sticky bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:px-6">
          <Button
            variant="danger-ghost"
            icon="trash"
            onClick={confirmDeleteOrder}
            disabled={displayedOrders.length <= 1 || currentOrderIsDeleted}
            aria-label="Eliminar pedido"
            title={displayedOrders.length <= 1 ? "No se puede eliminar el único pedido del Mail ID" : "Eliminar el pedido actual"}
          >
            <span className="hidden sm:inline">Eliminar pedido</span>
          </Button>
          <div className="flex-1" />
          <Button variant="primary" icon="send" onClick={handleFinalizeOrder} disabled={currentOrderIsDeleted}>
            Finalizar pedido
          </Button>
        </div>
      </div>

      {/* ── MODAL: FINALIZAR / PREVISUALIZAR / ENVIAR ──────────────────────── */}
      <Modal
        open={showOrderActionsModal}
        onClose={() => { if (!isSending) setShowOrderActionsModal(false); }}
        dismissable={!isSending}
        title={isShowingPreview ? "Previsualización del correo" : "Enviar pedido"}
        icon={isShowingPreview ? "eye" : "send"}
        size={isShowingPreview ? "xl" : "md"}
        footer={
          isShowingPreview ? (
            <>
              <Button variant="secondary" icon="chevronLeft" onClick={() => setIsShowingPreview(false)} disabled={isSending}>Volver</Button>
              <Button variant="primary" icon="send" onClick={performSendEmail} loading={isSending}>Enviar email</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setShowOrderActionsModal(false)} disabled={isSending}>Cerrar</Button>
              <Button variant="secondary" icon="eye" onClick={handlePreviewOrder} loading={isPreviewing} disabled={isSending}>Previsualizar</Button>
              <Button variant="primary" icon="send" onClick={performSendEmail} loading={isSending}>Enviar email</Button>
            </>
          )
        }
      >
        {isShowingPreview ? (
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <iframe
              srcDoc={previewHtmlContent}
              sandbox="" /* v51.5: sin scripts ni same-origin; el preview es HTML estático */
              className="block h-[62vh] w-full border-0"
              title="Previsualización del pedido"
            />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-fg-2">
              Se enviarán todos los pedidos del Mail ID <strong className="font-mono text-fg">{headerInfo.mailId || "—"}</strong>.
            </p>
            <ol className="space-y-2.5">
              {[
                "Se copia el correo completo al portapapeles.",
                `Se abre ${emailClientLabel} con el asunto listo.`,
                "Pega el contenido en el cuerpo del mensaje con Ctrl+V (Cmd+V en Mac).",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                  <span className="pt-0.5 text-fg-2">{t}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Modal>

      {/* ── MODAL: OBSERVACIÓN ─────────────────────────────────────────────── */}
      <Modal
        open={showObservationModal && !!currentEditingItemData}
        onClose={handleCloseObservationModal}
        title="Observación del pedido"
        icon="note"
        size="md"
        initialFocus={observationTextareaRef}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseObservationModal}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveObservation}>Guardar</Button>
          </>
        }
      >
        <label htmlFor="modalObservation" className="label">Observación</label>
        <textarea
          id="modalObservation"
          className="field min-h-28 resize-y"
          rows={4}
          value={modalObservationText}
          onChange={(e) => setModalObservationText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSaveObservation(); }}
          placeholder="Ej. Embarque sujeto a confirmación de espacio"
          ref={observationTextareaRef}
        />
        <p className="mt-2 text-xs text-muted">Se incluye en “Observaciones” del correo. Ctrl+Enter para guardar.</p>
      </Modal>

      {/* ── MODAL: MAIL ID EN USO ──────────────────────────────────────────── */}
      <Modal
        open={showPresenceModal}
        onClose={() => { setShowPresenceModal(false); setPendingSearchTerm(""); setPresenceConflictUsers([]); }}
        title="Mail ID en uso"
        icon="users"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowPresenceModal(false); setPendingSearchTerm(""); setPresenceConflictUsers([]); }}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={async () => {
                setShowPresenceModal(false);
                setPresenceConflictUsers([]);
                await enterMailId(pendingSearchTerm);
                setPendingSearchTerm("");
              }}
            >
              Abrir de todas formas
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          El Mail ID <strong className="font-mono text-fg">{pendingSearchTerm}</strong> está siendo editado por:
        </p>
        <ul className="my-3 space-y-1">
          {presenceConflictUsers.map((u) => (
            <li key={u} className="flex items-center gap-2 text-sm font-medium text-fg">
              <span className="h-2 w-2 rounded-full bg-warning" />{u}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Si lo abres igual, los cambios de ambos podrían solaparse y perderse información.</p>
      </Modal>

      <datalist id="apple-varieties">
        <option value="GALA" />
        <option value="GRANNY" />
        <option value="FUJI" />
        <option value="PINK LADY" />
        <option value="ROJA" />
        <option value="CRIPPS PINK" />
      </datalist>

      {/* ── PANEL: HISTORIAL DE ENVÍOS ─────────────────────────────────────── */}
      <Modal
        open={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        title="Historial de envíos"
        icon="clock"
        drawer
        footer={<p className="w-full text-center text-xs text-muted">Últimos {sentHistory.length} envío{sentHistory.length !== 1 ? "s" : ""} · solo los tuyos</p>}
      >
        {sentHistory.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">No hay envíos recientes.</p>
        ) : (
          <ul className="space-y-3">
            {sentHistory.map((entry) => {
              const proveedores = [...new Set(entry.orders.map((o) => o.header?.reDestinatarios).filter(Boolean))];
              const especies = [...new Set(entry.orders.flatMap((o) => o.items.map((i) => i.especie)).filter(Boolean))];
              const subject = generateEmailSubjectValue(proveedores, especies, "");
              return (
                <li key={entry.mailId} className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-fg">{entry.mailId}</span>
                    <span className="text-xs whitespace-nowrap text-muted">{formatRelativeTime(entry.latestUpdatedAt)}</span>
                  </div>
                  <p className="text-xs leading-snug break-all text-fg-2">{subject}</p>
                  <p className="text-xs text-muted">
                    {entry.orders.length} pedido{entry.orders.length > 1 ? "s" : ""}
                    {entry.orders[0]?.header?.reDestinatarios ? ` · ${entry.orders[0].header.reDestinatarios}` : ""}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="eye"
                      className="flex-1"
                      onClick={async () => {
                        setShowHistoryPanel(false);
                        setSearchTerm(entry.mailId);
                        setCommittedSearchTerm(entry.mailId);
                        await enterMailId(entry.mailId);
                      }}
                    >
                      Ver pedido
                    </Button>
                    <Button size="sm" variant="primary" icon="copy" className="flex-1" loading={historyResendingId === entry.mailId} onClick={() => resendFromHistory(entry.mailId)}>
                      Re-enviar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      {/* ── MODAL: NOVEDADES (una vez por versión) ─────────────────────────── */}
      <Modal
        open={showWhatsNew}
        onClose={() => { safeStorageSet(WHATSNEW_KEY, "seen"); setShowWhatsNew(false); }}
        title={`Novedades · ${WHATSNEW_VERSION}`}
        icon="sparkles"
        size="sm"
        footer={
          <Button variant="primary" className="w-full" onClick={() => { safeStorageSet(WHATSNEW_KEY, "seen"); setShowWhatsNew(false); }}>
            Entendido
          </Button>
        }
      >
        <ul className="space-y-4">
          {[
            { icon: "sparkles", title: "Nueva interfaz", desc: "Diseño más limpio, modo oscuro completo y pestañas para moverte entre los pedidos del mismo Mail ID." },
            { icon: "checkCircle", title: "Avisos de guardado", desc: "Verás cuándo se guardan tus cambios y un aviso claro si algo falla al guardar o enviar." },
            { icon: "chevronRight", title: "Teclado y celular", desc: "Las flechas respetan el cursor dentro del texto y en el celular puedes reordenar filas con ↑ ↓." },
          ].map(({ icon, title, desc }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon name={icon} className="h-4 w-4" /></span>
              <div>
                <p className="text-sm font-semibold text-fg">{title}</p>
                <p className="text-xs leading-snug text-muted">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </Modal>

      {/* ── AVISO DE NUEVA VERSIÓN ─────────────────────────────────────────── */}
      {updateAvailable && (
        <div className="fixed top-3 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-fg shadow-lg" role="status">
          <Icon name="sparkles" className="h-4 w-4" />
          <span>Hay una nueva versión disponible</span>
          <button
            type="button"
            onClick={async () => { try { await flushAndSave(); } catch { /* recarga igual */ } window.location.reload(); }}
            className="rounded-md bg-primary-fg px-3 py-1 text-xs font-bold text-primary"
          >
            Actualizar
          </button>
        </div>
      )}

      {confirmEl}
      {toastsEl}
    </div>
  );
};

export default App;
