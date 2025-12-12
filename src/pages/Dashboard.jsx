import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// 🔁 Use Render backend instead of localhost
// You can leave this exactly like this.
const API_BASE = "https://todo-backend-0drg.onrender.com/api";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // tasks from backend
  const [tasks, setTasks] = useState([]);

  // new task inputs
  const [newTask, setNewTask] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");

  // filter + sort
  const [filter, setFilter] = useState("all"); // all | completed
  const [sortMode, setSortMode] = useState("none"); // none | dueDate | priority | az

  // edit state (columns)
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editingPriority, setEditingPriority] = useState("medium");
  const [editingDueDate, setEditingDueDate] = useState("");

  // inline edit state (top list)
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditField, setInlineEditField] = useState(null); // "text" | "dueDate"
  const [inlineEditValue, setInlineEditValue] = useState("");

  // dark / light theme
  const [isDark, setIsDark] = useState(false);

  // widgets: notes + calendar
  const [notesText, setNotesText] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
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
      const res = await fetch(`${API_BASE}/me`, {
        credentials: "include",
      });

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
    if (isDark) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }, [isDark]);

  // ---------- DERIVED DATA ----------
  const filteredTasks = tasks.filter((t) => {
    if (filter === "completed") return t.completed;
    return true; // "all"
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

    return arr; // "none"
  })();

  // Upcoming tasks (next 2 days, not completed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoDaysFromNow = new Date(today);
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

  const upcomingTasks = tasks
    .filter((t) => {
      const d = parseTaskDate(t.dueDate);
      if (!d || t.completed) return false;
      return d >= today && d <= twoDaysFromNow;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // ---------- CALENDAR DERIVED DATA ----------
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
  const daysInMonth = new Date(
    calendarYear,
    calendarMonthIndex + 1,
    0
  ).getDate();

  const calendarCells = [];
  for (let i = 0; i < firstWeekday; i++) {
    calendarCells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(calendarYear, calendarMonthIndex, day);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const hasTasks = tasks.some((t) => t.dueDate === dateStr);
    calendarCells.push({ day, dateStr, hasTasks });
  }

  const calendarMonthLabel = `${monthNames[calendarMonthIndex]} ${calendarYear}`;
  const tasksOnSelectedDate = tasks.filter(
    (t) => t.dueDate === selectedDateStr
  );

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
    if (e.key === "Enter") {
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const handleEditTextChange = (e) => setEditingText(e.target.value);

  // ---------- INLINE EDIT HANDLERS (MY TASKS LIST) ----------
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
      setTasks((prev) =>
        prev.map((t) => (t.id === inlineEditId ? updated : t))
      );

      cancelInlineEdit();
    } catch (err) {
      console.error("Error saving inline edit:", err);
      cancelInlineEdit();
    }
  };

  const handleInlineKeyDown = (e) => {
    if (e.key === "Enter") {
      saveInlineEdit();
    } else if (e.key === "Escape") {
      cancelInlineEdit();
    }
  };

  // ---------- REUSABLE RENDER FOR A TASK ROW (COLUMNS) ----------
  const renderTaskRow = (task) => {
    const isEditing = editingId === task.id;
    const priorityLabel =
      task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

    return (
      <div className="todo-item-column">
        {/* checkbox */}
        <label className="todo-checkbox">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={() => toggleTask(task.id)}
          />
          <span className="checkmark" />
        </label>

        {/* middle area */}
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
                  "todo-text" +
                  (task.completed ? ` completed ${task.priority}` : "")
                }
              >
                {task.text}
              </span>

              <div className="todo-meta">
                <span className={"priority-badge priority-" + task.priority}>
                  {priorityLabel}
                </span>

                {task.dueDate && (
                  <span className="due-label">Due: {task.dueDate}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* actions */}
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
              <button
                className="task-btn edit-btn"
                onClick={() => startEditing(task)}
              >
                Edit
              </button>
              <button
                className="task-btn delete-btn"
                onClick={() => deleteTask(task.id)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  // ---------- JSX ----------
  return (
    <div className="page">
      <header className="topbar">
        {/* LEFT: user name */}
        <div className="topbar-section topbar-left">
          {user && <span className="topbar-username">{user.name}</span>}
        </div>

        {/* CENTER: app name */}
        <div className="topbar-section topbar-center">
          <h1 className="app-title">
            What To-Do{" "}
            <span role="img" aria-label="planner">
              📅
            </span>
          </h1>
        </div>

        {/* RIGHT: theme + logout */}
        <div className="topbar-section topbar-right">
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
        {/* 3-column dashboard layout */}
        <div className="dashboard-3col">
          {/* LEFT COLUMN: My Tasks + list card */}
          <div className="col-left">
            {/* CARD 1: add task + priority/date */}
            <section className="todo-card">
              <h1 className="todo-title">My Tasks</h1>

              {/* input row */}
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

              {/* priority + date for NEW task */}
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

            {/* CARD 2: filters + progress + inline list */}
            <section className="todo-card">
              {/* filters + sort */}
              <div className="todo-filter-row">
                <div className="todo-filters">
                  <button
                    className={
                      "todo-filter" + (filter === "all" ? " active" : "")
                    }
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

                  {/* Sort dropdown next to Completed */}
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

              {/* PROGRESS BAR */}
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

              {/* INLINE SORTED LIST */}
              <div className="todo-inline-list">
                {sortedForTop.length === 0 ? (
                  <p className="todo-inline-empty">
                    No tasks match this filter yet.
                  </p>
                ) : (
                  sortedForTop.map((task) => {
                    const isEditingText =
                      inlineEditId === task.id && inlineEditField === "text";
                    const isEditingDate =
                      inlineEditId === task.id && inlineEditField === "dueDate";

                    return (
                      <div key={task.id} className="todo-inline-item">
                        {/* checkbox */}
                        <label className="inline-checkbox">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => toggleTask(task.id)}
                          />
                          <span className="inline-checkmark" />
                        </label>

                        {/* task name: click to edit */}
                        {isEditingText ? (
                          <input
                            className="inline-edit-text"
                            value={inlineEditValue}
                            onChange={(e) =>
                              setInlineEditValue(e.target.value)
                            }
                            onKeyDown={handleInlineKeyDown}
                            onBlur={saveInlineEdit}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={
                              "inline-task-text" +
                              (task.completed
                                ? ` completed ${task.priority}`
                                : "")
                            }
                            onClick={() => startInlineEdit(task, "text")}
                          >
                            {task.text}
                            {/* priority label visible only when sorted by priority */}
                            {sortMode === "priority" && (
                              <span
                                className={`inline-priority-tag inline-${task.priority}`}
                              >
                                {task.priority
                                  .charAt(0)
                                  .toUpperCase() + task.priority.slice(1)}
                              </span>
                            )}
                          </span>
                        )}

                        {/* due date: click to edit */}
                        {task.dueDate || isEditingDate ? (
                          isEditingDate ? (
                            <input
                              className="inline-edit-date"
                              type="date"
                              value={inlineEditValue}
                              onChange={(e) =>
                                setInlineEditValue(e.target.value)
                              }
                              onKeyDown={handleInlineKeyDown}
                              onBlur={saveInlineEdit}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="inline-due"
                              onClick={() =>
                                startInlineEdit(task, "dueDate")
                              }
                            >
                              Due: {task.dueDate}
                            </span>
                          )
                        ) : (
                          <span
                            className="inline-due inline-due-empty"
                            onClick={() =>
                              startInlineEdit(task, "dueDate")
                            }
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
          <div className="col-middle">
            <section className="board-wrapper">
              <div className="priority-columns">
                {/* LOW */}
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

                {/* MEDIUM */}
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

                {/* HIGH */}
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

          {/* RIGHT COLUMN: widgets (upcoming, notes, calendar) */}
          <div className="col-right">
            {/* Upcoming tasks widget */}
            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Upcoming (next 2 days)</h3>
              {upcomingTasks.length === 0 ? (
                <p className="upcoming-empty">
                  No tasks due in the next two days.
                </p>
              ) : (
                <div className="upcoming-list">
                  {upcomingTasks.map((t) => (
                    <div key={t.id} className="upcoming-item">
                      <span className="upcoming-text">{t.text}</span>
                      <span className="upcoming-date-pill">
                        {t.dueDate || "No date"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Notes widget */}
            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Notes</h3>
              <textarea
                className="notes-textarea"
                placeholder="Jot down quick notes..."
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
              />
            </section>

            {/* Calendar widget */}
            <section className="dashboard-widget">
              <h3 className="dashboard-widget-title">Task Calendar</h3>

              <div className="calendar-header">
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={goPrevMonth}
                >
                  ‹
                </button>
                <span className="calendar-month-label">
                  {calendarMonthLabel}
                </span>
                <button
                  type="button"
                  className="calendar-nav-btn"
                  onClick={goNextMonth}
                >
                  ›
                </button>
              </div>

              <div className="calendar-grid">
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
                    >
                      {cell.day}
                    </button>
                  ) : (
                    <div key={idx} className="calendar-day empty" />
                  )
                )}
              </div>

              <div className="calendar-task-list">
                {tasksOnSelectedDate.length === 0 ? (
                  <p className="calendar-empty">No tasks due this day.</p>
                ) : (
                  <ul>
                    {tasksOnSelectedDate.map((t) => (
                      <li key={t.id} className="calendar-task-item">
                        <span className="calendar-task-text">{t.text}</span>
                        <span
                          className={
                            "calendar-task-tag calendar-" + t.priority
                          }
                        >
                          {t.priority
                            .charAt(0)
                            .toUpperCase() + t.priority.slice(1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
