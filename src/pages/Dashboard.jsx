import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// 🔁 Use Render backend instead of localhost
const API_BASE = "https://todo-backend-0drg.onrender.com/api";

// ---- localStorage keys ----
const LS_THEME = "todo_theme_dark";
const LS_NOTES = "todo_notes";
const LS_SORT = "todo_sort_mode";
const LS_FILTER = "todo_filter";
const LS_CAL_OPEN = "todo_calendar_open";
const LS_CAL_MONTH = "todo_calendar_month"; // ISO string
const LS_CAL_SELECTED = "todo_calendar_selected"; // YYYY-MM-DD

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // tasks from backend
  const [tasks, setTasks] = useState([]);

  // new task inputs
  const [newTask, setNewTask] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");

  // ✅ persisted: filter + sort
  const [filter, setFilter] = useState(() => {
    const v = localStorage.getItem(LS_FILTER);
    return v === "completed" ? "completed" : "all";
  });

  const [sortMode, setSortMode] = useState(() => {
    const v = localStorage.getItem(LS_SORT);
    return ["none", "dueDate", "priority", "az"].includes(v) ? v : "none";
  });

  // edit state (columns)
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editingPriority, setEditingPriority] = useState("medium");
  const [editingDueDate, setEditingDueDate] = useState("");

  // inline edit state (top list)
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditField, setInlineEditField] = useState(null); // "text" | "dueDate"
  const [inlineEditValue, setInlineEditValue] = useState("");

  // ✅ persisted: dark / light theme
  const [isDark, setIsDark] = useState(() => {
    const v = localStorage.getItem(LS_THEME);
    return v === "true";
  });

  // ✅ persisted: notes
  const [notesText, setNotesText] = useState(() => {
    return localStorage.getItem(LS_NOTES) || "";
  });

  // ✅ persisted: calendar modal toggle + state
  const [isCalendarOpen, setIsCalendarOpen] = useState(() => {
    const v = localStorage.getItem(LS_CAL_OPEN);
    return v === "true";
  });

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const iso = localStorage.getItem(LS_CAL_MONTH);
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const saved = localStorage.getItem(LS_CAL_SELECTED);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  // --------- helper to map API task to UI shape ----------
  const mapTaskFromApi = (t) => ({
    id: t._id,
    text: t.text,
    completed: t.completed,
    priority: t.priority || "medium",
    dueDate: t.dueDate || "",
  });

  // helper: parse a task dueDate safely
  const parseTaskDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // ---------- AUTH + LOAD TASKS ----------
  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/me`, { credentials: "include" });

      if (!res.ok) {
        navigate("/"); // not logged in → back to login
        return;
      }

      const data = await res.json();
      setUser(data.user);

      try {
        const tasksRes = await fetch(`${API_BASE}/tasks`, {
          credentials: "include",
        });
        if (tasksRes.ok) {
          const apiTasks = await tasksRes.json();
          setTasks(apiTasks.map(mapTaskFromApi));
        } else {
          console.error("Failed to load tasks");
        }
      } catch (err) {
        console.error("Error fetching tasks:", err);
      }
    })();
  }, [navigate]);

  // ---------- DARK MODE SIDE EFFECT ----------
  useEffect(() => {
    if (isDark) document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");
  }, [isDark]);

  // ✅ persist settings
  useEffect(() => {
    localStorage.setItem(LS_THEME, String(isDark));
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem(LS_NOTES, notesText);
  }, [notesText]);

  useEffect(() => {
    localStorage.setItem(LS_SORT, sortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem(LS_FILTER, filter);
  }, [filter]);

  useEffect(() => {
    localStorage.setItem(LS_CAL_OPEN, String(isCalendarOpen));
  }, [isCalendarOpen]);

  useEffect(() => {
    localStorage.setItem(LS_CAL_MONTH, calendarMonth.toISOString());
  }, [calendarMonth]);

  useEffect(() => {
    localStorage.setItem(LS_CAL_SELECTED, selectedDateStr);
  }, [selectedDateStr]);

  // ✅ Close calendar on Escape
  useEffect(() => {
    if (!isCalendarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsCalendarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCalendarOpen]);

  // ---------- DERIVED DATA ----------
  const filteredTasks = tasks.filter((t) => {
    if (filter === "completed") return t.completed;
    return true;
  });

  const remainingCount = tasks.filter((t) => !t.completed).length;
  const totalTasks = tasks.length;
  const completedCount = totalTasks - remainingCount;
  const progressPercent =
    totalTasks === 0 ? 0 : Math.round((completedCount / totalTasks) * 100);

  // apply sort to filtered tasks (for the top list)
  const sortedForTop = (() => {
    const arr = [...filteredTasks];

    if (sortMode === "dueDate") {
      return arr.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    }

    if (sortMode === "priority") {
      const order = { high: 0, medium: 1, low: 2 };
      return arr.sort(
        (a, b) =>
          (order[a.priority] ?? 3) - (order[b.priority] ?? 3) ||
          a.text.localeCompare(b.text)
      );
    }

    if (sortMode === "az") {
      return arr.sort((a, b) => a.text.localeCompare(b.text));
    }

    return arr;
  })();

  // Show the priority board only when sort is priority
  const showPriorityBoard = sortMode === "priority";

  // ---------- SMART DUE BUCKETS (Overdue / Today / This Week) ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // end of week = Saturday
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const dueTasks = tasks
    .filter((t) => !!parseTaskDate(t.dueDate) && !t.completed)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const overdueTasks = dueTasks.filter((t) => {
    const d = parseTaskDate(t.dueDate);
    return d && d < today;
  });

  const dueTodayTasks = dueTasks.filter((t) => {
    const d = parseTaskDate(t.dueDate);
    return d && d.getTime() === today.getTime();
  });

  const dueThisWeekTasks = dueTasks.filter((t) => {
    const d = parseTaskDate(t.dueDate);
    if (!d) return false;
    return d > today && d <= endOfWeek;
  });

  // ---------- CALENDAR DERIVED DATA (for modal) ----------
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const firstWeekday = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();

  // Map of YYYY-MM-DD -> tasks for that day (fast lookup)
  const tasksByDate = useMemo(() => {
    const m = new Map();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = t.dueDate;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(t);
    }
    return m;
  }, [tasks]);

  const calendarCells = [];
  for (let i = 0; i < firstWeekday; i++) calendarCells.push(null);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(calendarYear, calendarMonthIndex, day);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const dayTasks = tasksByDate.get(dateStr) || [];
    calendarCells.push({
      day,
      dateStr,
      hasTasks: dayTasks.length > 0,
      count: dayTasks.length,
    });
  }

  const calendarMonthLabel = `${monthNames[calendarMonthIndex]} ${calendarYear}`;
  const tasksOnSelectedDate = tasksByDate.get(selectedDateStr) || [];

  const goPrevMonth = () => {
    setCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const goNextMonth = () => {
    setCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  // ---------- BASIC HANDLERS ----------
  const handleAdd = async () => {
    const trimmed = newTask.trim();
    if (!trimmed) return;

    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: trimmed,
          priority: newPriority,
          dueDate: newDueDate || "",
        }),
      });

      if (!res.ok) {
        console.error("Failed to create task");
        return;
      }

      const created = await res.json();
      const mapped = mapTaskFromApi(created);

      setTasks((prev) => [...prev, mapped]);
      setNewTask("");
      setNewPriority("medium");
      setNewDueDate("");
    } catch (err) {
      console.error("Error creating task:", err);
    }
  };

  const toggleTask = async (id) => {
    const current = tasks.find((t) => t.id === id);
    if (!current) return;

    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed: !current.completed }),
      });

      if (!res.ok) {
        console.error("Failed to toggle task");
        return;
      }

      const updated = mapTaskFromApi(await res.json());
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.error("Error toggling task:", err);
    }
  };

  const deleteTask = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        console.error("Failed to delete task");
        return;
      }

      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Error logging out:", e);
    } finally {
      setUser(null);
      setTasks([]);
      navigate("/");
    }
  };

  // ---------- EDIT HANDLERS (COLUMNS) ----------
  const startEditing = (task) => {
    setEditingId(task.id);
    setEditingText(task.text);
    setEditingPriority(task.priority || "medium");
    setEditingDueDate(task.dueDate || "");
  };

  const saveEdit = async () => {
    const trimmed = editingText.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/tasks/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: trimmed,
          priority: editingPriority,
          dueDate: editingDueDate,
        }),
      });

      if (!res.ok) {
        console.error("Failed to update task");
        return;
      }

      const updated = mapTaskFromApi(await res.json());
      setTasks((prev) => prev.map((t) => (t.id === editingId ? updated : t)));

      setEditingId(null);
      setEditingText("");
      setEditingPriority("medium");
      setEditingDueDate("");
    } catch (err) {
      console.error("Error updating task:", err);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
    setEditingPriority("medium");
    setEditingDueDate("");
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter") saveEdit();
    else if (e.key === "Escape") cancelEdit();
  };

  const handleEditTextChange = (e) => setEditingText(e.target.value);

  // ---------- INLINE EDIT HANDLERS ----------
  const startInlineEdit = (task, field) => {
    setInlineEditId(task.id);
    setInlineEditField(field);
    setInlineEditValue(field === "text" ? task.text : task.dueDate || "");
  };

  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineEditField(null);
    setInlineEditValue("");
  };

  const saveInlineEdit = async () => {
    if (!inlineEditId || !inlineEditField) return;

    const current = tasks.find((t) => t.id === inlineEditId);
    if (!current) {
      cancelInlineEdit();
      return;
    }

    let updates = {};
    if (inlineEditField === "text") {
      const trimmed = inlineEditValue.trim();
      if (!trimmed) {
        cancelInlineEdit();
        return;
      }
      updates.text = trimmed;
    } else {
      updates.dueDate = inlineEditValue;
    }

    try {
      const res = await fetch(`${API_BASE}/tasks/${inlineEditId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        console.error("Failed to update task");
        cancelInlineEdit();
        return;
      }

      const updated = mapTaskFromApi(await res.json());
      setTasks((prev) => prev.map((t) => (t.id === inlineEditId ? updated : t)));

      cancelInlineEdit();
    } catch (err) {
      console.error("Error saving inline edit:", err);
      cancelInlineEdit();
    }
  };

  const handleInlineKeyDown = (e) => {
    if (e.key === "Enter") saveInlineEdit();
    else if (e.key === "Escape") cancelInlineEdit();
  };

  // ---------- REUSABLE RENDER FOR A TASK ROW (COLUMNS) ----------
  const renderTaskRow = (task) => {
    const isEditing = editingId === task.id;
    const priorityLabel =
      task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

    return (
      <div className="todo-item-column">
        <label className="todo-checkbox">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => toggleTask(task.id)}
          />
          <span className="checkmark" />
        </label>

        <div className="todo-main">
          {isEditing ? (
            <>
              <input
                className="todo-edit-input"
                value={editingText}
                onChange={handleEditTextChange}
                onKeyDown={handleEditKeyDown}
                autoFocus
              />

              <div className="todo-edit-meta-row">
                <select
                  className="todo-edit-priority"
                  value={editingPriority}
                  onChange={(e) => setEditingPriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>

                <input
                  className="todo-edit-date"
                  type="date"
                  value={editingDueDate}
                  onChange={(e) => setEditingDueDate(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <span
                className={
                  "todo-text" + (task.completed ? ` completed ${task.priority}` : "")
                }
              >
                {task.text}
              </span>

              <div className="todo-meta">
                <span className={"priority-badge priority-" + task.priority}>
                  {priorityLabel}
                </span>
                {task.dueDate && <span className="due-label">Due: {task.dueDate}</span>}
              </div>
            </>
          )}
        </div>

        <div className="todo-actions">
          {isEditing ? (
            <>
              <button className="task-btn edit-btn" onClick={saveEdit}>
                Save
              </button>
              <button className="task-btn delete-btn" onClick={cancelEdit}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="task-btn edit-btn" onClick={() => startEditing(task)}>
                Edit
              </button>
              <button className="task-btn delete-btn" onClick={() => deleteTask(task.id)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ---------- CALENDAR MODAL ----------
  const calendarModal = isCalendarOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setIsCalendarOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1050px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          borderRadius: 18,
          padding: 18,
          border: "1px solid rgba(255,255,255,0.08)",
          background: isDark ? "#020617" : "#ffffff",
          color: isDark ? "#e5e7eb" : "#111827",
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              Calendar View
            </h2>
            <span style={{ opacity: 0.75, fontSize: 13 }}>
              Click a day to see tasks due
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCalendarOpen(false)}
            className="task-btn delete-btn"
          >
            Close
          </button>
        </div>

        <div className="calendar-header" style={{ marginBottom: 10 }}>
          <button type="button" className="calendar-nav-btn" onClick={goPrevMonth}>
            ‹
          </button>
          <span className="calendar-month-label">{calendarMonthLabel}</span>
          <button type="button" className="calendar-nav-btn" onClick={goNextMonth}>
            ›
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 16,
          }}
        >
          <div>
            <div className="calendar-grid" style={{ fontSize: 13 }}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="calendar-day-label">
                  {d}
                </div>
              ))}

              {calendarCells.map((cell, idx) =>
                cell ? (
                  <button
                    key={idx}
                    type="button"
                    className={
                      "calendar-day" +
                      (cell.hasTasks ? " has-task" : "") +
                      (cell.dateStr === selectedDateStr ? " selected" : "")
                    }
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    style={{ position: "relative" }}
                    title={cell.hasTasks ? `${cell.count} task(s) due` : "No tasks due"}
                  >
                    {cell.day}
                    {cell.hasTasks && (
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: 999,
                          background: isDark ? "#111827" : "#eef0f3",
                        }}
                      >
                        {cell.count}
                      </span>
                    )}
                  </button>
                ) : (
                  <div key={idx} className="calendar-day empty" />
                )
              )}
            </div>
          </div>

          <div
            style={{
              borderRadius: 14,
              border: isDark ? "1px solid #111827" : "1px solid #e5e7eb",
              background: isDark ? "#020617" : "#ffffff",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>Tasks due</div>
                <div style={{ opacity: 0.75, fontSize: 13 }}>{selectedDateStr}</div>
              </div>

              <button
                type="button"
                className="task-btn edit-btn"
                onClick={() => {
                  const d = new Date();
                  const ds = d.toISOString().slice(0, 10);
                  setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  setSelectedDateStr(ds);
                }}
              >
                Today
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {tasksOnSelectedDate.length === 0 ? (
                <p className="calendar-empty" style={{ margin: 0 }}>
                  No tasks due this day.
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {tasksOnSelectedDate
                    .slice()
                    .sort((a, b) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
                    })
                    .map((t) => (
                      <li
                        key={t.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 10px",
                          borderRadius: 12,
                          background: isDark ? "#0b1220" : "#f9fafb",
                          border: isDark ? "1px solid #111827" : "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span
                            style={{
                              fontWeight: 700,
                              textDecoration: t.completed ? "line-through" : "none",
                              opacity: t.completed ? 0.75 : 1,
                            }}
                          >
                            {t.text}
                          </span>
                          <span style={{ fontSize: 12, opacity: 0.75 }}>
                            {t.completed ? "Completed" : "Not completed"}
                          </span>
                        </div>

                        <span className={"calendar-task-tag calendar-" + (t.priority || "medium")}>
                          {(t.priority || "medium").charAt(0).toUpperCase() +
                            (t.priority || "medium").slice(1)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ---------- JSX ----------
  return (
    <div className="page">
      {calendarModal}

      <header className="topbar">
        <div className="topbar-section topbar-left">
          {user && <span className="topbar-username">{user.name}</span>}
        </div>

        <div className="topbar-section topbar-center">
          <h1 className="app-title">
            What To-Do{" "}
            <span role="img" aria-label="planner">
              📅
            </span>
          </h1>
        </div>

        <div className="topbar-section topbar-right">
          <button
            className="theme-toggle-btn"
            onClick={() => setIsCalendarOpen(true)}
            title="Open Calendar View"
          >
            📅 Calendar
          </button>

          <button
            className="theme-toggle-btn"
            onClick={() => setIsDark((prev) => !prev)}
          >
            {isDark ? "☀️ Light" : "🌙 Dark"}
          </button>

          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <div className={`dashboard-3col ${showPriorityBoard ? "" : "no-middle"}`}>
          {/* LEFT COLUMN */}
          <div className="col-left">
            <section className="todo-card">
              <h1 className="todo-title">My Tasks</h1>

              <div className="todo-input-row">
                <input
                  className="todo-input"
                  type="text"
                  placeholder="Type your task here.."
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <button className="todo-add-btn" onClick={handleAdd}>
                  + Add
                </button>
              </div>

              <div className="todo-meta-input-row">
                <select
                  className="todo-priority-select"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                >
                  <option value="low">Low priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="high">High priority</option>
                </select>

                <input
                  className="todo-date-input"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
            </section>

            <section className="todo-card">
              <div className="todo-filter-row">
                <div className="todo-filters">
                  <button
                    className={"todo-filter" + (filter === "all" ? " active" : "")}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </button>

                  <button
                    className={
                      "todo-filter" + (filter === "completed" ? " active" : "")
                    }
                    onClick={() => setFilter("completed")}
                  >
                    Completed
                  </button>

                  <select
                    className="todo-priority-select todo-sort-select"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                  >
                    <option value="none">Sort: Default</option>
                    <option value="dueDate">Sort: Due date</option>
                    <option value="priority">Sort: Priority</option>
                    <option value="az">Sort: A–Z</option>
                  </select>
                </div>
              </div>

              <div className="progress-section">
                <div className="progress-label-row">
                  <span>Progress</span>
                  <span>
                    {completedCount}/{totalTasks} completed
                    {totalTasks > 0 && ` • ${progressPercent}%`}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="todo-inline-list">
                {sortedForTop.length === 0 ? (
                  <p className="todo-inline-empty">No tasks match this filter yet.</p>
                ) : (
                  sortedForTop.map((task) => {
                    const isEditingText =
                      inlineEditId === task.id && inlineEditField === "text";
                    const isEditingDate =
                      inlineEditId === task.id && inlineEditField === "dueDate";

                    return (
                      <div key={task.id} className="todo-inline-item">
                        <label className="inline-checkbox">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => toggleTask(task.id)}
                          />
                          <span className="inline-checkmark" />
                        </label>

                        {isEditingText ? (
                          <input
                            className="inline-edit-text"
                            value={inlineEditValue}
                            onChange={(e) => setInlineEditValue(e.target.value)}
                            onKeyDown={handleInlineKeyDown}
                            onBlur={saveInlineEdit}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={
                              "inline-task-text" +
                              (task.completed ? ` completed ${task.priority}` : "")
                            }
                            onClick={() => startInlineEdit(task, "text")}
                          >
                            {task.text}
                            {sortMode === "priority" && (
                              <span className={`inline-priority-tag inline-${task.priority}`}>
                                {task.priority.charAt(0).toUpperCase() +
                                  task.priority.slice(1)}
                              </span>
                            )}
                          </span>
                        )}

                        {task.dueDate || isEditingDate ? (
                          isEditingDate ? (
                            <input
                              className="inline-edit-date"
                              type="date"
                              value={inlineEditValue}
                              onChange={(e) => setInlineEditValue(e.target.value)}
                              onKeyDown={handleInlineKeyDown}
                              onBlur={saveInlineEdit}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="inline-due"
                              onClick={() => startInlineEdit(task, "dueDate")}
                            >
                              Due: {task.dueDate}
                            </span>
                          )
                        ) : (
                          <span
                            className="inline-due inline-due-empty"
                            onClick={() => startInlineEdit(task, "dueDate")}
                          >
                            + Add due date
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          {/* MIDDLE COLUMN: priority board */}
          {showPriorityBoard && (
            <div className="col-middle">
              <section className="board-wrapper">
                <div className="priority-columns">
                  <div className="priority-column">
                    <h3 className="priority-title low">Low Priority</h3>
                    {filteredTasks
                      .filter((t) => t.priority === "low")
                      .map((task) => (
                        <div key={task.id} className="priority-task-card">
                          {renderTaskRow(task)}
                        </div>
                      ))}
                  </div>

                  <div className="priority-column">
                    <h3 className="priority-title medium">Medium Priority</h3>
                    {filteredTasks
                      .filter((t) => t.priority === "medium")
                      .map((task) => (
                        <div key={task.id} className="priority-task-card">
                          {renderTaskRow(task)}
                        </div>
                      ))}
                  </div>

                  <div className="priority-column">
                    <h3 className="priority-title high">High Priority</h3>
                    {filteredTasks
                      .filter((t) => t.priority === "high")
                      .map((task) => (
                        <div key={task.id} className="priority-task-card">
                          {renderTaskRow(task)}
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* RIGHT COLUMN: smart widgets + notes (calendar removed) */}
          <div className="col-right">
            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Overdue</h3>
              {overdueTasks.length === 0 ? (
                <p className="upcoming-empty">No overdue tasks 🎉</p>
              ) : (
                <div className="upcoming-list">
                  {overdueTasks.map((t) => (
                    <div key={t.id} className="upcoming-item">
                      <span className="upcoming-text">{t.text}</span>
                      <span className="upcoming-date-pill">{t.dueDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Due Today</h3>
              {dueTodayTasks.length === 0 ? (
                <p className="upcoming-empty">Nothing due today ✅</p>
              ) : (
                <div className="upcoming-list">
                  {dueTodayTasks.map((t) => (
                    <div key={t.id} className="upcoming-item">
                      <span className="upcoming-text">{t.text}</span>
                      <span className="upcoming-date-pill">{t.dueDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Due This Week</h3>
              {dueThisWeekTasks.length === 0 ? (
                <p className="upcoming-empty">No tasks due this week.</p>
              ) : (
                <div className="upcoming-list">
                  {dueThisWeekTasks.map((t) => (
                    <div key={t.id} className="upcoming-item">
                      <span className="upcoming-text">{t.text}</span>
                      <span className="upcoming-date-pill">{t.dueDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Notes</h3>
              <textarea
                className="notes-textarea"
                placeholder="Jot down quick notes..."
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}