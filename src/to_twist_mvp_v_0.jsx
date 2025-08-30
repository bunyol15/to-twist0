import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, CalendarDays, ListChecks, LayoutGrid, Trash2, Settings, CheckSquare, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock4, Flag, Filter, SortAsc, SortDesc, Edit3, X, Check, Palette, SidebarClose, Sidebar as SidebarIcon, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/*
  to-twist — MVP v0.2
  ----------------------------------------------------
  Cambios clave solicitados:
  - Atajos deshabilitados mientras se edita/añade/busca (no interrumpen la escritura).
  - Se elimina "Repetir" del editor (la detección inteligente ya se encarga).
  - Más opciones en "Cuándo": Hoy, Mañana, Programado y Fecha concreta (selector que fija fecha y cae en "Próximo").
  - Badges de prioridad con colores pastel: P1 rojo suave, P2 naranja suave, P3 azul suave, P4 blanco.
  - Nueva ruta en la barra lateral: "Calendario" con vistas Mensual / Semanal / Diaria.
  - Subtareas: se pueden añadir desde un bloque "Avanzado" (plegado por defecto), se muestran contraídas/expandibles en las vistas y se pueden completar.
  - Etiqueta de "Cuándo" antes de prioridad (Hoy, Mañana o fecha tipo "14 de julio").
  - Fechas (límite/recordatorio) se muestran como "30 de mayo 11:24".
*/

// --------- Utilidades de fecha (ES) ---------
const MESES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

function parseSpanishDate(text) {
  // Busca "15 de abril" o "15 abril" opcionalmente con asterisco para fecha límite
  const regex = /(\*?)(\d{1,2})\s*(?:de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i;
  const m = text.match(regex);
  if (!m) return null;
  const isDeadline = !!m[1];
  const day = parseInt(m[2], 10);
  const monthName = m[3].toLowerCase();
  const month = MESES[monthName];
  const now = new Date();
  let year = now.getFullYear();
  // si la fecha ya pasó este año, asume próximo año
  const candidate = new Date(year, month, day, 9, 0, 0);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    year += 1;
  }
  const d = new Date(year, month, day, 9, 0, 0);
  return { date: d.toISOString(), isDeadline };
}

function startOfDayISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return x.toISOString();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date, weekStartsOn = 1) { // 1=Lunes, 0=Domingo
  const d = new Date(date);
  const day = (d.getDay() + 7 - weekStartsOn) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

function formatESPretty(d) {
  // "30 de mayo 11:24"
  const day = d.getDate();
  const month = d.toLocaleDateString('es-ES', { month: 'long' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} de ${month} ${hh}:${mm}`;
}

function formatESDateOnly(d) {
  // "14 de julio"
  const day = d.getDate();
  const month = d.toLocaleDateString('es-ES', { month: 'long' });
  return `${day} de ${month}`;
}

// --------- Storage simple ---------
const STORAGE_KEY = "to_twist_tasks_v1";
const SETTINGS_KEY = "to_twist_settings_v1";

function loadStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveStorage(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// --------- Tipos ---------
const defaultSettings = {
  theme: "lavanda",
  sidebarOpen: true,
  startOfWeek: 1, // lunes
  timeFormat: 24,
  dateFormat: "DD/MM/YYYY",
  soonWindowDays: 7,
  smartParse: true,
  shortcuts: {
    newTask: "n",
    search: "/",
    toggleSidebar: "h",
    next: "j",
    prev: "k",
    cycleView: "v",
  },
};

const THEMES = {
  lavanda: {
    bg: "#f5f1ff",
    card: "#ffffff",
    primary: "#7c75f2",
    accent: "#cabffb",
  },
  frambuesa: { bg: "#fff1f5", card: "#ffffff", primary: "#ff6b9e", accent: "#ffd0e1" },
  mandarina: { bg: "#fff7ed", card: "#ffffff", primary: "#ff8a3d", accent: "#ffe1c7" },
  verdelima: { bg: "#f3fff4", card: "#ffffff", primary: "#3fbf6f", accent: "#c9f2d9" },
  lunapiedra: { bg: "#eef2ff", card: "#ffffff", primary: "#647acb", accent: "#dbe4ff" },
};

// --------- Componentes básicos ---------
function useSettings() {
  const [settings, setSettings] = useState(() => loadStorage(SETTINGS_KEY, defaultSettings));
  useEffect(() => saveStorage(SETTINGS_KEY, settings), [settings]);
  return [settings, setSettings];
}

function useTasks() {
  const [tasks, setTasks] = useState(() => loadStorage(STORAGE_KEY, []));

  // purge 30 días en Eliminadas
  useEffect(() => {
    const now = new Date();
    const kept = tasks.filter(t => !t.completedAt || (now - new Date(t.completedAt)) < 30*24*60*60*1000);
    if (kept.length !== tasks.length) setTasks(kept);
    // eslint-disable-next-line
  }, []);

  useEffect(() => saveStorage(STORAGE_KEY, tasks), [tasks]);

  return [tasks, setTasks];
}

function Badge({ children, className = "" }) {
  return (
    <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border " + className}>{children}</span>
  );
}

function IconButton({ title, onClick, children, className = "" }) {
  return (
    <button title={title} onClick={onClick} className={`p-2 rounded-xl hover:bg-black/5 transition ${className}`}>
      {children}
    </button>
  );
}

// --------- App ---------
export default function App() {
  const [settings, setSettings] = useSettings();
  const theme = THEMES[settings.theme] || THEMES.lavanda;
  const [tasks, setTasks] = useTasks();

  const [route, setRoute] = useState("hoy"); // hoy | proximo | todas | eliminadas | calendario
  const [view, setView] = useState("list"); // list | board | calendar (para rutas no-calendario)
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Calendario dedicado (ruta "calendario")
  const [calendarMode, setCalendarMode] = useState('month'); // 'month' | 'week' | 'day'
  const [calendarDate, setCalendarDate] = useState(new Date());

  const modalOpen = !!(addOpen || searchOpen || editingTask);

  // keyboard shortcuts (deshabilitados en modales/inputs)
  useEffect(() => {
    function onKey(e) {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = ['input','textarea'].includes(activeTag) || document.activeElement?.isContentEditable;
      if (modalOpen || isTyping) return; // bloquear atajos si está escribiendo o hay modal

      const s = settings.shortcuts;
      const key = e.key.toLowerCase();
      if (key === s.newTask) { e.preventDefault(); setAddOpen(true); }
      if (key === s.search) { e.preventDefault(); setSearchOpen(true); }
      if (key === s.toggleSidebar) { e.preventDefault(); setSettings(x => ({...x, sidebarOpen: !x.sidebarOpen})); }
      if (key === s.cycleView) { e.preventDefault(); setView(v => v === "list" ? "board" : v === "board" ? "calendar" : "list"); }
      if (key === s.next) { /* navegación entre tareas */ }
      if (key === s.prev) { /* navegación entre tareas */ }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings, modalOpen]);

  // theme CSS vars
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--bg", theme.bg);
    root.setProperty("--card", theme.card);
    root.setProperty("--primary", theme.primary);
    root.setProperty("--accent", theme.accent);
  }, [theme]);

  // helpers
  const todayISO = startOfDayISO(new Date());
  const tomorrowISO = startOfDayISO(addDays(new Date(), 1));
  const soonLimit = addDays(new Date(), settings.soonWindowDays);

  function visibleByRoute(arr) {
    if (route === "hoy") return arr.filter(x => !x.completedAt).filter(x => x.when === "hoy" || (x.dueDate && startOfDayISO(new Date(x.dueDate)) === todayISO));
    if (route === "proximo") return arr.filter(x => !x.completedAt).filter(x => {
      const due = x.dueDate ? new Date(x.dueDate) : null;
      if (!due) return x.when === 'mañana' || x.when === 'programado';
      const isToday = startOfDayISO(due) === todayISO;
      return !isToday && due <= soonLimit; // aparece en Próximo
    });
    if (route === "todas") return arr.filter(x => !x.completedAt);
    if (route === "eliminadas") return arr.filter(x => !!x.completedAt);
    if (route === "calendario") return arr; // calendario maneja su propio filtrado
    return arr;
  }

  const visible = useMemo(() => {
    let arr = tasks;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(x => (x.title + " " + (x.description||"")).toLowerCase().includes(q));
    }
    return visibleByRoute(arr);
  }, [tasks, route, query, settings]);

  function toggleComplete(task) {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completedAt: t.completedAt ? null : new Date().toISOString() } : t));
  }

  function toggleSubtask(taskId, subId) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const subs = (t.subtasks||[]).map(s => s.id === subId ? { ...s, completed: !s.completed } : s);
      return { ...t, subtasks: subs };
    }));
  }

  function addTask(data) {
    const id = crypto.randomUUID();
    const now = new Date();
    const t = { id, title: data.title, description: data.description||"", priority: data.priority||"P4", dueDate: data.dueDate||null, reminder: data.reminder||null, when: data.when||"hoy", subtasks: data.subtasks||[], createdAt: now.toISOString(), completedAt: null };

    // smart parse
    if (settings.smartParse) {
      const parsed = parseSpanishDate(data.title);
      if (parsed) {
        if (!data.dueDate) t.dueDate = parsed.date;
        t.when = (startOfDayISO(new Date(t.dueDate)) === todayISO) ? 'hoy' : 'programado';
      } else if (/\bhoy\b/i.test(data.title)) { t.when = "hoy"; t.dueDate = now.toISOString(); }
      else if (/\bmañana\b/i.test(data.title)) { t.when = "mañana"; t.dueDate = addDays(now,1).toISOString(); }
      else if (/\bdentro de una semana\b/i.test(data.title)) { t.when = "programado"; t.dueDate = addDays(now,7).toISOString(); }
    }

    setTasks(prev => [t, ...prev]);
  }

  function updateTask(id, patch) { setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function hardDeleteSelected() { setTasks(prev => prev.filter(t => !selectedIds.has(t.id))); setSelectedIds(new Set()); }
  function restoreSelected() { setTasks(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, completedAt: null } : t)); setSelectedIds(new Set()); }

  // --------- UI ---------
  return (
    <div className="min-h-screen w-full" style={{ background: "var(--bg)" }}>
      <div className="flex">
        {/* Sidebar */}
        <AnimatePresence>
          {settings.sidebarOpen && (
            <motion.aside
              initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}
              className="w-72 h-screen sticky top-0 border-r border-black/10 bg-white/80 backdrop-blur-sm">
              <div className="relative">
                {/* Toggle on top-right */}
                <div className="absolute right-2 top-2">
                  <IconButton title="Ocultar barra" onClick={() => setSettings(s => ({...s, sidebarOpen: false}))}>
                    <SidebarClose size={18} />
                  </IconButton>
                </div>
                {/* Logo */}
                <div className="flex items-center gap-3 px-4 py-4">
                  <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "var(--primary)"}}>
                    <Check size={16} style={{ color: "var(--primary)"}} />
                  </div>
                  <div className="text-lg font-semibold tracking-tight">to-twist</div>
                </div>

                {/* Nav */}
                <nav className="px-2 py-2 text-sm">
                  <SidebarItem icon={<Plus size={18} />} label="Añadir tarea" onClick={() => setAddOpen(true)} />
                  <SidebarItem icon={<Search size={18} />} label="Buscador" onClick={() => setSearchOpen(true)} />
                  <SidebarItem active={route==="hoy"} onClick={() => setRoute("hoy")} icon={<CalendarDays size={18} />} label="Hoy" />
                  <SidebarItem active={route==="proximo"} onClick={() => setRoute("proximo")} icon={<CalendarIcon size={18} />} label="Próximo" />
                  <SidebarItem active={route==="todas"} onClick={() => setRoute("todas")} icon={<ListChecks size={18} />} label="Todas" />
                  <SidebarItem active={route==="eliminadas"} onClick={() => setRoute("eliminadas")} icon={<Trash2 size={18} />} label="Eliminadas" />
                  <SidebarItem active={route==="calendario"} onClick={() => setRoute("calendario")} icon={<CalendarIcon size={18} />} label="Calendario" />
                  <div className="h-px my-3 bg-black/10" />
                  <SidebarItem icon={<Settings size={18} />} label="Configuración" onClick={() => setEditingTask({ settings: true })} />
                </nav>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main */}
        <div className="flex-1 min-h-screen">
          {/* top bar */}
          <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/70 border-b border-black/10">
            <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
              {!settings.sidebarOpen && (
                <IconButton title="Mostrar barra" onClick={() => setSettings(s => ({...s, sidebarOpen: true}))}>
                  <SidebarIcon size={18} />
                </IconButton>
              )}
              <div className="text-xl font-semibold capitalize">{route}</div>
              <div className="text-sm text-black/60">{route!=="eliminadas" ? `${visible.filter(x=>!x.completedAt).length} tareas` : `${visible.length} elementos`}</div>

              <div className="ml-auto flex items-center gap-1">
                <IconButton title="Buscar" onClick={()=>setSearchOpen(true)}><Search size={18}/></IconButton>
                <IconButton title="Añadir tarea" onClick={()=>setAddOpen(true)}><Plus size={18}/></IconButton>
                {route !== 'calendario' && (
                  <>
                    <div className="w-px h-6 bg-black/10 mx-1" />
                    <IconButton title="Lista" onClick={()=>setView("list")}><ListChecks size={18}/></IconButton>
                    <IconButton title="Panel" onClick={()=>setView("board")}><LayoutGrid size={18}/></IconButton>
                    <IconButton title="Calendario" onClick={()=>setView("calendar")}><CalendarIcon size={18}/></IconButton>
                  </>
                )}
              </div>
            </div>
          </div>

          <main className="max-w-6xl mx-auto px-4 py-6">
            {/* Barra de modos del calendario cuando route=calendario */}
            {route === 'calendario' && (
              <div className="mb-4 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <IconButton title="Anterior" onClick={()=>{
                    if (calendarMode==='month') setCalendarDate(d=>new Date(d.getFullYear(), d.getMonth()-1, 1));
                    if (calendarMode==='week') setCalendarDate(d=>addDays(d,-7));
                    if (calendarMode==='day') setCalendarDate(d=>addDays(d,-1));
                  }}><ChevronLeft size={18}/></IconButton>
                  <IconButton title="Siguiente" onClick={()=>{
                    if (calendarMode==='month') setCalendarDate(d=>new Date(d.getFullYear(), d.getMonth()+1, 1));
                    if (calendarMode==='week') setCalendarDate(d=>addDays(d,7));
                    if (calendarMode==='day') setCalendarDate(d=>addDays(d,1));
                  }}><ChevronRight size={18}/></IconButton>
                </div>
                <button className={`px-3 py-1.5 rounded-xl border text-sm ${calendarMode==='day'?'bg-black/5 font-medium':''}`} onClick={()=>setCalendarMode('day')}>Diaria</button>
                <button className={`px-3 py-1.5 rounded-xl border text-sm ${calendarMode==='week'?'bg-black/5 font-medium':''}`} onClick={()=>setCalendarMode('week')}>Semanal</button>
                <button className={`px-3 py-1.5 rounded-xl border text-sm ${calendarMode==='month'?'bg-black/5 font-medium':''}`} onClick={()=>setCalendarMode('month')}>Mensual</button>
              </div>
            )}

            {route !== "eliminadas" && route !== 'calendario' && (
              <div className="mb-4 flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={()=>setSelectMode(v=>!v)}>{selectMode?"Salir de selección":"Seleccionar"}</button>
                {selectMode && (
                  <>
                    <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={()=>setSelectedIds(new Set(visible.map(t=>t.id)))}>Seleccionar todo</button>
                    <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={()=>setSelectedIds(new Set())}>Limpiar</button>
                    <BulkActions tasks={tasks} selectedIds={selectedIds} updateTask={updateTask} />
                  </>
                )}
              </div>
            )}

            {route !== 'calendario' && view === "list" && (
              <div className="space-y-3">
                {groupByPriority(visible, route).map(group => (
                  <section key={group.key}>
                    {route!=="eliminadas" && <h3 className="text-sm font-medium text-black/60 mb-2">{group.title}</h3>}
                    <div className="grid gap-2">
                      {group.items.map(task => (
                        <TaskCard key={task.id} task={task} selectMode={selectMode} selected={selectedIds.has(task.id)}
                          onSelect={(ch)=>{
                            const s = new Set(selectedIds); if (ch) s.add(task.id); else s.delete(task.id); setSelectedIds(s);
                          }}
                          onToggle={()=>toggleComplete(task)} onEdit={()=>setEditingTask(task)} onToggleSubtask={toggleSubtask} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {route !== 'calendario' && view === "board" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['P1','P2','P3','P4'].map(p => (
                  <div key={p} className="rounded-2xl border bg-[var(--card)]/90 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{p}</div>
                      <Flag size={16} />
                    </div>
                    <div className="space-y-2">
                      {visible.filter(t=>t.priority===p).map(task => (
                        <TaskCard key={task.id} task={task} compact selectMode={selectMode} selected={selectedIds.has(task.id)}
                          onSelect={(ch)=>{const s=new Set(selectedIds); if(ch)s.add(task.id); else s.delete(task.id); setSelectedIds(s);}}
                          onToggle={()=>toggleComplete(task)} onEdit={()=>setEditingTask(task)} onToggleSubtask={toggleSubtask} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(route !== 'calendario' && view === "calendar") && (
              <CalendarView tasks={visible} month={new Date()} onEdit={setEditingTask} />
            )}

            {route === 'calendario' && (
              <AdvancedCalendar tasks={tasks.filter(t=>!t.completedAt)} mode={calendarMode} date={calendarDate} setDate={setCalendarDate} onEdit={setEditingTask} />
            )}

            {route === "eliminadas" && (
              <div className="flex items-center gap-2 mb-4">
                <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={()=>setSelectMode(v=>!v)}>{selectMode?"Salir de selección":"Seleccionar"}</button>
                {selectMode && (
                  <>
                    <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={()=>setSelectedIds(new Set(visible.map(t=>t.id)))}>Seleccionar todo</button>
                    <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={()=>setSelectedIds(new Set())}>Limpiar</button>
                    <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={restoreSelected}>Recuperar</button>
                    <button className="px-3 py-1.5 rounded-xl border text-sm hover:bg-black/5" onClick={hardDeleteSelected}>Borrar definitivamente</button>
                  </>
                )}
              </div>
            )}

          </main>
        </div>
      </div>

      {/* Modales */}
      <AnimatePresence>
        {searchOpen && (
          <Modal onClose={()=>setSearchOpen(false)}>
            <div className="w-full max-w-xl">
              <div className="text-lg font-semibold mb-2">Buscar</div>
              <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Escribe para buscar..." className="w-full px-4 py-3 rounded-2xl border outline-none"/>
              <div className="mt-4 text-sm text-black/60">Resultados</div>
              <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
                {visible.map(t => (
                  <button key={t.id} onClick={()=>{ setEditingTask(t); setSearchOpen(false); }} className="w-full text-left rounded-2xl border p-3 hover:bg-black/5">
                    <div className="font-medium">{t.title}</div>
                    {t.description && <div className="text-sm text-black/60 line-clamp-2">{t.description}</div>}
                  </button>
                ))}
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen && (
          <Modal onClose={()=>setAddOpen(false)}>
            <TaskEditor onCancel={()=>setAddOpen(false)} onSave={(data)=>{ addTask(data); setAddOpen(false); }} />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!!editingTask && !editingTask.settings && (
          <Modal onClose={()=>setEditingTask(null)}>
            <TaskEditor task={editingTask} onCancel={()=>setEditingTask(null)} onSave={(d)=>{ updateTask(editingTask.id, d); setEditingTask(null); }} />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!!editingTask?.settings && (
          <Modal onClose={()=>setEditingTask(null)}>
            <SettingsPanel settings={settings} setSettings={setSettings} />
          </Modal>
        )}
      </AnimatePresence>

      <style>{`
        :root { --bg:${theme.bg}; --card:${theme.card}; --primary:${theme.primary}; --accent:${theme.accent}; }
      `}</style>
    </div>
  );
}

// --------- Subcomponentes ---------
function SidebarItem({ icon, label, onClick, active }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 ${active?"bg-black/5 font-medium":""}`}>
      <span className="text-black">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function WhenBadge({ when, dueDate }) {
  let label = null;
  if (when === 'hoy') label = 'Hoy';
  else if (when === 'mañana') label = 'Mañana';
  else if (dueDate) label = formatESDateOnly(new Date(dueDate));
  if (!label) return null;
  return <Badge className="border-blue-200 bg-blue-50 text-blue-700">{label}</Badge>;
}

function priorityStyles(priority) {
  switch (priority) {
    case 'P1': return 'border-red-200 bg-red-50 text-red-700';
    case 'P2': return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'P3': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'P4': return 'border-black/10 bg-white text-black';
    default: return 'border-black/10 bg-white text-black';
  }
}

function TaskCard({ task, onToggle, onEdit, selectMode, selected, onSelect, compact, onToggleSubtask }) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const rem = task.reminder ? new Date(task.reminder) : null;
  const [openSubs, setOpenSubs] = useState(false);
  const subs = task.subtasks || [];
  const hasSubs = subs.length > 0;

  return (
    <div className="rounded-2xl border bg-[var(--card)]/90 p-3 flex items-start gap-3">
      {selectMode ? (
        <input type="checkbox" checked={selected} onChange={e=>onSelect?.(e.target.checked)} className="mt-1" />
      ) : (
        <input type="checkbox" checked={!!task.completedAt} onChange={onToggle} className="mt-1" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <WhenBadge when={task.when} dueDate={task.dueDate} />
              {task.priority && <Badge className={priorityStyles(task.priority)}>{task.priority}</Badge>}
            </div>
            <div className="font-medium truncate">{task.title}</div>
            {task.description && !compact && (
              <div className="text-sm text-black/60 whitespace-pre-wrap">{task.description}</div>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {due && (
                <Badge className="border-yellow-200 bg-yellow-50 text-yellow-700 flex items-center gap-1">
                  <Clock4 size={14} /> {formatESPretty(due)}
                </Badge>
              )}
              {rem && (
                <Badge className="border-green-200 bg-green-50 text-green-700 flex items-center gap-1">
                  <Clock4 size={14} /> {formatESPretty(rem)}
                </Badge>
              )}
            </div>
            {hasSubs && (
              <div className="mt-2">
                <button onClick={()=>setOpenSubs(v=>!v)} className="text-xs rounded-lg border px-2 py-1 inline-flex items-center gap-1 hover:bg-black/5">
                  {openSubs ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} Subtareas ({subs.filter(s=>s.completed).length}/{subs.length})
                </button>
                <AnimatePresence>
                  {openSubs && (
                    <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="mt-2 pl-4 space-y-1">
                      {subs.map(st => (
                        <label key={st.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!st.completed} onChange={()=>onToggleSubtask?.(task.id, st.id)} />
                          <span className={st.completed?"line-through text-black/50":""}>{st.title}</span>
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <IconButton title="Editar" onClick={onEdit}><Edit3 size={16}/></IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupByPriority(items, route) {
  if (route === "eliminadas") return [{ key: "completed", title: "Completadas", items }];
  const priorities = ["P1","P2","P3","P4"]; 
  return priorities.map(p => ({ key: p, title: `Prioridad ${p.substring(1)}`, items: items.filter(t=>t.priority===p) }));
}

function Modal({ children, onClose }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="relative z-10 w-full max-w-2xl rounded-3xl border bg-white p-6 shadow-xl">
        <button onClick={onClose} className="absolute right-3 top-3 p-2 rounded-xl hover:bg-black/5"><X size={16}/></button>
        {children}
      </motion.div>
    </motion.div>
  );
}

function TaskEditor({ task, onSave, onCancel }) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [priority, setPriority] = useState(task?.priority || "P4");
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.substring(0,16) : "");
  const [reminder, setReminder] = useState(task?.reminder ? task.reminder.substring(0,16) : "");
  const [when, setWhen] = useState(task?.when || "hoy");

  // Subtareas (en Avanzado)
  const [subsOpen, setSubsOpen] = useState(false);
  const [subtasks, setSubtasks] = useState(task?.subtasks || []);
  const [subInput, setSubInput] = useState("");

  // Control de "Fecha concreta" para cuándo
  const [customWhenDate, setCustomWhenDate] = useState(task?.dueDate ? task.dueDate.substring(0,16) : "");

  function addSubtask() {
    const title = subInput.trim();
    if (!title) return;
    setSubtasks(prev => [{ id: crypto.randomUUID(), title, completed: false }, ...prev]);
    setSubInput("");
  }

  function removeSubtask(id) {
    setSubtasks(prev => prev.filter(s => s.id !== id));
  }

  function submit() {
    const payload = { 
      title, description, priority,
      when,
      dueDate: dueDate? new Date(dueDate).toISOString() : (when==='fecha' && customWhenDate? new Date(customWhenDate).toISOString() : task?.dueDate || null),
      reminder: reminder? new Date(reminder).toISOString(): null,
      subtasks,
    };
    // Si se elige "fecha" como cuándo, forzamos when a programado
    if (when==='fecha') payload.when = 'programado';
    onSave(payload);
  }

  return (
    <div>
      <div className="text-lg font-semibold mb-3">{task?"Editar tarea":"Nueva tarea"}</div>
      <div className="space-y-4">
        <div className="space-y-2">
          <input autoFocus required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Nombre de la tarea" className="w-full px-4 py-3 rounded-2xl border outline-none" />
          <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Descripción (opcional)" className="w-full px-4 py-3 rounded-2xl border outline-none min-h-[80px]" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">Prioridad</span>
            <select value={priority} onChange={e=>setPriority(e.target.value)} className="px-3 py-2 border rounded-xl">
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Cuándo</span>
            <select value={when} onChange={e=>setWhen(e.target.value)} className="px-3 py-2 border rounded-xl">
              <option value="hoy">Hoy</option>
              <option value="mañana">Mañana</option>
              <option value="programado">Programado</option>
              <option value="fecha">Fecha concreta</option>
            </select>
          </div>

          {(when === 'fecha') && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <span className="text-sm">Elegir fecha</span>
              <input type="datetime-local" value={customWhenDate} onChange={e=>setCustomWhenDate(e.target.value)} className="px-3 py-2 border rounded-xl w-full"/>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm">Fecha límite</span>
            <input type="datetime-local" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="px-3 py-2 border rounded-xl w-full"/>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm">Recordatorio</span>
            <input type="datetime-local" value={reminder} onChange={e=>setReminder(e.target.value)} className="px-3 py-2 border rounded-xl w-full"/>
          </div>
        </div>

        {/* Avanzado (subtareas) */}
        <div className="rounded-2xl border">
          <button onClick={()=>setSubsOpen(v=>!v)} className="w-full flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">Avanzado</span>
            {subsOpen? <ChevronUp size={16}/> : <ChevronDown size={16}/>}            
          </button>
          <AnimatePresence>
            {subsOpen && (
              <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="px-4 pb-4 space-y-3">
                <div className="text-sm text-black/70">Subtareas</div>
                <div className="flex gap-2">
                  <input value={subInput} onChange={e=>setSubInput(e.target.value)} placeholder="Añadir subtarea" className="flex-1 px-3 py-2 border rounded-xl" />
                  <button onClick={addSubtask} className="px-3 py-2 rounded-xl border hover:bg-black/5">Añadir</button>
                </div>
                <div className="space-y-2">
                  {subtasks.map(s => (
                    <div key={s.id} className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm bg-white">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={!!s.completed} onChange={()=> setSubtasks(prev=>prev.map(x=>x.id===s.id?{...x, completed:!x.completed}:x))} />
                        <span className={s.completed?"line-through text-black/50":""}>{s.title}</span>
                      </div>
                      <button onClick={()=>removeSubtask(s.id)} className="text-black/60 hover:text-black">Eliminar</button>
                    </div>
                  ))}
                  {subtasks.length===0 && <div className="text-xs text-black/50">No hay subtareas todavía.</div>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-xl border">Cancelar</button>
          <button onClick={submit} className="px-4 py-2 rounded-xl text-white" style={{ background: "var(--primary)" }}>{task?"Guardar":"Añadir"}</button>
        </div>
      </div>
      <div className="mt-4 text-xs text-black/50">
        Consejo: escribe una fecha en el título (p.ej. "15 de abril" o "*20 de mayo") para fijar automáticamente la fecha.
      </div>
    </div>
  );
}

function SettingsPanel({ settings, setSettings }) {
  const themeKeys = Object.keys(THEMES);
  return (
    <div className="w-full max-w-2xl">
      <div className="text-lg font-semibold mb-3">Configuración</div>
      <div className="space-y-6">
        <section className="rounded-2xl border p-4">
          <div className="font-medium mb-2 flex items-center gap-2"><Palette size={16}/> Tema</div>
          <div className="flex flex-wrap gap-2">
            {themeKeys.map(key => (
              <button key={key} onClick={()=>setSettings(s=>({...s, theme:key}))} className={`px-3 py-2 rounded-xl border ${settings.theme===key?"ring-2 ring-[var(--primary)]":""}`} style={{ background: THEMES[key].bg }}>{key}</button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <div className="font-medium mb-2">Atajos</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {Object.entries(settings.shortcuts).map(([k,v]) => (
              <div key={k} className="flex items-center gap-2">
                <label className="w-40 text-sm capitalize">{k}</label>
                <input value={v} onChange={e=>setSettings(s=>({...s, shortcuts:{...s.shortcuts, [k]: e.target.value}}))} className="px-3 py-2 border rounded-xl w-24"/>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <div className="font-medium mb-2">General</div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><span>Inicio de semana</span>
              <select value={settings.startOfWeek} onChange={e=>setSettings(s=>({...s, startOfWeek: parseInt(e.target.value)}))} className="px-3 py-2 border rounded-xl">
                <option value={1}>Lunes</option>
                <option value={0}>Domingo</option>
              </select>
            </div>
            <div className="flex items-center gap-2"><span>Ventana Próximo (días)</span>
              <input type="number" min={1} max={90} value={settings.soonWindowDays} onChange={e=>setSettings(s=>({...s, soonWindowDays: parseInt(e.target.value)||7 }))} className="px-3 py-2 border rounded-xl w-24"/>
            </div>
            <div className="flex items-center gap-2"><span>Reconocimiento inteligente</span>
              <input type="checkbox" checked={settings.smartParse} onChange={e=>setSettings(s=>({...s, smartParse:e.target.checked}))} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function BulkActions({ selectedIds, updateTask }) {
  const [due, setDue] = useState("");
  const [rem, setRem] = useState("");
  const [priority, setPriority] = useState("");
  function apply() {
    selectedIds.forEach(id => {
      const patch = {};
      if (due) patch.dueDate = new Date(due).toISOString();
      if (rem) patch.reminder = new Date(rem).toISOString();
      if (priority) patch.priority = priority;
      updateTask(id, patch);
    });
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} className="px-3 py-1.5 border rounded-xl"/>
      <input type="datetime-local" value={rem} onChange={e=>setRem(e.target.value)} className="px-3 py-1.5 border rounded-xl"/>
      <select value={priority} onChange={e=>setPriority(e.target.value)} className="px-3 py-1.5 border rounded-xl">
        <option value="">Prioridad…</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P3">P3</option>
        <option value="P4">P4</option>
      </select>
      <button onClick={apply} className="px-3 py-1.5 rounded-xl border hover:bg-black/5">Aplicar</button>
    </div>
  );
}

function CalendarView({ tasks, month, onEdit }) {
  // simple calendario mensual (legacy para vista rápida)
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const startIdx = (first.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, m+1, 0).getDate();
  const cells = [];
  for (let i=0;i<startIdx;i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="grid grid-cols-7 text-xs bg-white/70">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(h=> <div key={h} className="p-2 text-center font-medium border-b">{h}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => (
          <div key={i} className="min-h-[120px] border p-2 bg-[var(--card)]/70">
            {d && <div className="text-xs font-medium mb-1">{d.getDate()}</div>}
            <div className="space-y-1">
              {d && tasks.filter(t=> t.dueDate && startOfDayISO(new Date(t.dueDate)) === startOfDayISO(d)).map(t => (
                <button key={t.id} onClick={()=>onEdit?.(t)} className="w-full text-left text-xs rounded-lg border px-2 py-1 hover:bg-black/5">
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvancedCalendar({ tasks, mode, date, setDate, onEdit }) {
  if (mode === 'month') return <CalendarView tasks={tasks} month={new Date(date)} onEdit={onEdit} />;

  if (mode === 'week') {
    const start = startOfWeek(date, 1);
    const days = Array.from({length:7}).map((_,i)=> addDays(start, i));
    return (
      <div className="rounded-2xl border overflow-hidden">
        <div className="grid grid-cols-7 text-xs bg-white/70">
          {days.map(d=> <div key={d.toISOString()} className="p-2 text-center font-medium border-b">{formatESDateOnly(d)}</div>)}
        </div>
        <div className="grid grid-cols-7 min-h-[300px]">
          {days.map(d => (
            <div key={d.toISOString()} className="border p-2 bg-[var(--card)]/70">
              <div className="space-y-1">
                {tasks.filter(t=> t.dueDate && startOfDayISO(new Date(t.dueDate)) === startOfDayISO(d)).map(t => (
                  <button key={t.id} onClick={()=>onEdit?.(t)} className="w-full text-left text-xs rounded-lg border px-2 py-1 hover:bg-black/5">
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // day view
  const d = new Date(date);
  const items = tasks.filter(t=> t.dueDate && startOfDayISO(new Date(t.dueDate)) === startOfDayISO(d));
  return (
    <div className="rounded-2xl border">
      <div className="px-4 py-2 border-b text-sm font-medium bg-white/70">{formatESDateOnly(d)}</div>
      <div className="p-3 space-y-2">
        {items.length===0 && <div className="text-sm text-black/60">No hay tareas para este día.</div>}
        {items.map(t => (
          <button key={t.id} onClick={()=>onEdit?.(t)} className="w-full text-left rounded-xl border px-3 py-2 hover:bg-black/5">
            <div className="text-sm font-medium">{t.title}</div>
            {t.dueDate && <div className="text-xs text-black/60">{formatESPretty(new Date(t.dueDate))}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
