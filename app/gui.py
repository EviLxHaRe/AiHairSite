from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Iterable, List, Sequence

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from app.auth_db import User, authenticate, create_user, ensure_default_admin, init_db, list_users
from app.evaluation import evaluate_test_file, resolve_model_path


def _read_json_or_none(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _draw_plot_area(canvas: tk.Canvas, width: int, height: int, title: str):
    margin_left = 80
    margin_top = 45
    margin_right = 40
    margin_bottom = 70

    x0 = margin_left
    y0 = margin_top
    x1 = width - margin_right
    y1 = height - margin_bottom

    canvas.create_rectangle(x0, y0, x1, y1, outline="#1f2937", width=2)
    canvas.create_text(width / 2, 20, text=title, font=("TkDefaultFont", 12, "bold"))
    return x0, y0, x1, y1


def draw_line_chart(
    canvas: tk.Canvas,
    width: int,
    height: int,
    title: str,
    values: Sequence[float],
    x_label: str,
    y_label: str,
) -> None:
    x0, y0, x1, y1 = _draw_plot_area(canvas, width, height, title)

    canvas.create_text((x0 + x1) / 2, height - 25, text=x_label)
    canvas.create_text(25, (y0 + y1) / 2, text=y_label, angle=90)

    if not values:
        canvas.create_text((x0 + x1) / 2, (y0 + y1) / 2, text="Нет данных")
        return

    min_v = min(values)
    max_v = max(values)
    if abs(max_v - min_v) < 1e-9:
        max_v = min_v + 1e-6

    points = []
    for idx, value in enumerate(values):
        if len(values) == 1:
            px = (x0 + x1) / 2
        else:
            px = x0 + idx * (x1 - x0) / (len(values) - 1)
        py = y1 - ((value - min_v) / (max_v - min_v)) * (y1 - y0)
        points.extend([px, py])
        canvas.create_oval(px - 2, py - 2, px + 2, py + 2, fill="#2563eb", outline="")

    if len(points) >= 4:
        canvas.create_line(points, fill="#2563eb", width=2)

    # y ticks
    for i in range(5):
        ratio = i / 4
        value = max_v - ratio * (max_v - min_v)
        py = y0 + ratio * (y1 - y0)
        canvas.create_line(x0 - 5, py, x0, py, fill="#111827")
        canvas.create_text(x0 - 8, py, text=f"{value:.2f}", anchor="e", font=("TkDefaultFont", 8))

    # x ticks
    tick_count = min(8, len(values))
    for i in range(tick_count):
        idx = int(round(i * (len(values) - 1) / max(1, tick_count - 1)))
        px = x0 + (0 if len(values) == 1 else idx * (x1 - x0) / (len(values) - 1))
        canvas.create_line(px, y1, px, y1 + 5, fill="#111827")
        canvas.create_text(px, y1 + 16, text=str(idx + 1), font=("TkDefaultFont", 8))


def draw_horizontal_bar_chart(
    canvas: tk.Canvas,
    width: int,
    height: int,
    title: str,
    labels: Sequence[str],
    values: Sequence[int],
) -> None:
    x0, y0, x1, y1 = _draw_plot_area(canvas, width, height, title)

    if not labels:
        canvas.create_text((x0 + x1) / 2, (y0 + y1) / 2, text="Нет данных")
        return

    max_v = max(values) if values else 1
    max_v = max(max_v, 1)
    n = len(labels)
    step = (y1 - y0) / n
    bar_height = max(8, step * 0.65)

    for idx, (label, value) in enumerate(zip(labels, values)):
        cy = y0 + step * idx + step / 2
        bar_len = (value / max_v) * (x1 - x0 - 180)
        lx = x0 + 140
        canvas.create_text(x0 + 135, cy, text=label, anchor="e", font=("TkDefaultFont", 9))
        canvas.create_rectangle(lx, cy - bar_height / 2, lx + bar_len, cy + bar_height / 2, fill="#059669", outline="")
        canvas.create_text(lx + bar_len + 8, cy, text=str(value), anchor="w", font=("TkDefaultFont", 9))


def draw_binary_series_chart(
    canvas: tk.Canvas,
    width: int,
    height: int,
    title: str,
    values: Sequence[int],
) -> None:
    x0, y0, x1, y1 = _draw_plot_area(canvas, width, height, title)

    canvas.create_text((x0 + x1) / 2, height - 25, text="Индекс записи")
    canvas.create_text(25, (y0 + y1) / 2, text="Корректность", angle=90)

    if not values:
        canvas.create_text((x0 + x1) / 2, (y0 + y1) / 2, text="Нет данных")
        return

    n = len(values)
    for idx, value in enumerate(values):
        px = x0 + idx * (x1 - x0) / max(1, n - 1)
        py = y1 - float(value) * (y1 - y0)
        color = "#16a34a" if int(value) == 1 else "#dc2626"
        canvas.create_line(px, y1, px, py, fill=color)

    canvas.create_text(x0 - 10, y1, text="0", anchor="e")
    canvas.create_text(x0 - 10, y0, text="1", anchor="e")


class ZoomableChart(ttk.Frame):
    def __init__(self, parent: tk.Widget, width: int = 1200, height: int = 420):
        super().__init__(parent)
        self.base_width = width
        self.base_height = height

        self.canvas = tk.Canvas(self, bg="white", highlightthickness=0)
        self.x_scroll = ttk.Scrollbar(self, orient="horizontal", command=self.canvas.xview)
        self.y_scroll = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)

        self.canvas.configure(xscrollcommand=self.x_scroll.set, yscrollcommand=self.y_scroll.set)

        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.y_scroll.grid(row=0, column=1, sticky="ns")
        self.x_scroll.grid(row=1, column=0, sticky="ew")

        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)

        self.canvas.bind("<MouseWheel>", self._on_mousewheel)
        self.canvas.bind("<Button-4>", self._on_mousewheel)
        self.canvas.bind("<Button-5>", self._on_mousewheel)

    def _on_mousewheel(self, event: tk.Event) -> None:
        if getattr(event, "num", None) == 4 or getattr(event, "delta", 0) > 0:
            factor = 1.1
        else:
            factor = 0.9

        x = self.canvas.canvasx(event.x)
        y = self.canvas.canvasy(event.y)
        self.canvas.scale("all", x, y, factor, factor)

        bbox = self.canvas.bbox("all")
        if bbox:
            self.canvas.configure(scrollregion=bbox)

    def render(self, draw_fn: Callable, *args) -> None:
        self.canvas.delete("all")
        draw_fn(self.canvas, self.base_width, self.base_height, *args)
        bbox = self.canvas.bbox("all")
        if bbox:
            self.canvas.configure(scrollregion=bbox)
        else:
            self.canvas.configure(scrollregion=(0, 0, self.base_width, self.base_height))


class LoginFrame(ttk.Frame):
    def __init__(self, parent: tk.Widget, app: "AlienSignalApp"):
        super().__init__(parent, padding=24)
        self.app = app

        ttk.Label(self, text="Авторизация", font=("TkDefaultFont", 14, "bold")).grid(
            row=0, column=0, columnspan=2, pady=(0, 12)
        )

        ttk.Label(self, text="Логин").grid(row=1, column=0, sticky="e", padx=8, pady=4)
        self.username_entry = ttk.Entry(self, width=28)
        self.username_entry.grid(row=1, column=1, pady=4)

        ttk.Label(self, text="Пароль").grid(row=2, column=0, sticky="e", padx=8, pady=4)
        self.password_entry = ttk.Entry(self, width=28, show="*")
        self.password_entry.grid(row=2, column=1, pady=4)

        login_button = ttk.Button(self, text="Войти", command=self._login)
        login_button.grid(row=3, column=0, columnspan=2, pady=12)

        self.status_var = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.status_var, foreground="#b91c1c").grid(
            row=4, column=0, columnspan=2
        )

        self.username_entry.focus_set()

    def _login(self) -> None:
        username = self.username_entry.get().strip()
        password = self.password_entry.get()
        if not username or not password:
            self.status_var.set("Введите логин и пароль")
            return

        user = authenticate(self.app.db_path, username, password)
        if user is None:
            self.status_var.set("Неверные данные для входа")
            return

        self.app.login_success(user)


class AdminFrame(ttk.Frame):
    def __init__(self, parent: tk.Widget, app: "AlienSignalApp", user: User):
        super().__init__(parent, padding=16)
        self.app = app
        self.user = user

        header = ttk.Frame(self)
        header.pack(fill="x")
        ttk.Label(
            header,
            text=f"Администратор: {user.first_name} {user.last_name} ({user.username})",
            font=("TkDefaultFont", 12, "bold"),
        ).pack(side="left")
        ttk.Button(header, text="Выйти", command=self.app.logout).pack(side="right")

        form = ttk.LabelFrame(self, text="Создание пользователя", padding=12)
        form.pack(fill="x", pady=12)

        self.first_name = ttk.Entry(form, width=24)
        self.last_name = ttk.Entry(form, width=24)
        self.username = ttk.Entry(form, width=24)
        self.password = ttk.Entry(form, width=24, show="*")
        self.role = ttk.Combobox(form, values=["user", "admin"], state="readonly", width=21)
        self.role.set("user")

        fields = [
            ("Имя", self.first_name),
            ("Фамилия", self.last_name),
            ("Логин", self.username),
            ("Пароль", self.password),
            ("Роль", self.role),
        ]

        for idx, (label, widget) in enumerate(fields):
            ttk.Label(form, text=label).grid(row=idx, column=0, sticky="e", pady=3, padx=5)
            widget.grid(row=idx, column=1, sticky="w", pady=3, padx=5)

        ttk.Button(form, text="Создать", command=self._create_user).grid(
            row=len(fields), column=0, columnspan=2, pady=(8, 2)
        )

        self.status_var = tk.StringVar(value="")
        ttk.Label(form, textvariable=self.status_var, foreground="#0369a1").grid(
            row=len(fields) + 1, column=0, columnspan=2
        )

        users_frame = ttk.LabelFrame(self, text="Пользователи в БД", padding=8)
        users_frame.pack(fill="both", expand=True)

        self.users_list = tk.Listbox(users_frame, height=12)
        self.users_list.pack(fill="both", expand=True)
        self._refresh_users()

    def _create_user(self) -> None:
        first = self.first_name.get().strip()
        last = self.last_name.get().strip()
        username = self.username.get().strip()
        password = self.password.get()
        role = self.role.get().strip()

        try:
            ok = create_user(
                self.app.db_path,
                username=username,
                password=password,
                first_name=first,
                last_name=last,
                role=role,
            )
        except ValueError as exc:
            self.status_var.set(str(exc))
            return

        if not ok:
            self.status_var.set("Пользователь с таким логином уже существует")
            return

        self.status_var.set("Пользователь создан")
        self.first_name.delete(0, tk.END)
        self.last_name.delete(0, tk.END)
        self.username.delete(0, tk.END)
        self.password.delete(0, tk.END)
        self.role.set("user")
        self._refresh_users()

    def _refresh_users(self) -> None:
        self.users_list.delete(0, tk.END)
        for user in list_users(self.app.db_path):
            self.users_list.insert(
                tk.END,
                f"#{user.user_id} | {user.username} | {user.first_name} {user.last_name} | {user.role}",
            )


class UserFrame(ttk.Frame):
    def __init__(self, parent: tk.Widget, app: "AlienSignalApp", user: User):
        super().__init__(parent, padding=12)
        self.app = app
        self.user = user

        top = ttk.Frame(self)
        top.pack(fill="x", pady=(0, 8))

        user_info = (
            f"Пользователь: {user.first_name} {user.last_name} | "
            f"Логин: {user.username} | Роль: {user.role}"
        )
        ttk.Label(top, text=user_info, font=("TkDefaultFont", 11, "bold")).pack(side="left")

        actions = ttk.Frame(self)
        actions.pack(fill="x", pady=(0, 8))

        ttk.Button(actions, text="Загрузить тестовый .npz", command=self._upload_test_file).pack(
            side="left", padx=(0, 6)
        )
        ttk.Button(actions, text="Обновить аналитику", command=self.refresh_dashboard).pack(
            side="left", padx=(0, 6)
        )
        ttk.Button(actions, text="Выйти", command=self.app.logout).pack(side="left")

        self.status_var = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.status_var, foreground="#0369a1").pack(anchor="w")

        metrics_frame = ttk.Frame(self)
        metrics_frame.pack(fill="x", pady=(6, 10))
        self.loss_var = tk.StringVar(value="Test loss: -")
        self.acc_var = tk.StringVar(value="Test accuracy: -")
        ttk.Label(metrics_frame, textvariable=self.loss_var, font=("TkDefaultFont", 10, "bold")).pack(
            side="left", padx=(0, 20)
        )
        ttk.Label(metrics_frame, textvariable=self.acc_var, font=("TkDefaultFont", 10, "bold")).pack(
            side="left"
        )

        notebook = ttk.Notebook(self)
        notebook.pack(fill="both", expand=True)

        self.val_acc_chart = ZoomableChart(notebook)
        self.train_dist_chart = ZoomableChart(notebook)
        self.test_record_chart = ZoomableChart(notebook)
        self.top5_chart = ZoomableChart(notebook)

        notebook.add(self.val_acc_chart, text="Val accuracy / epochs")
        notebook.add(self.train_dist_chart, text="Train class distribution")
        notebook.add(self.test_record_chart, text="Точность по каждой записи test")
        notebook.add(self.top5_chart, text="Top-5 valid classes")

        self.refresh_dashboard()

    @property
    def artifacts_dir(self) -> Path:
        return Path(self.app.artifacts_dir)

    def _upload_test_file(self) -> None:
        file_path = filedialog.askopenfilename(
            title="Выберите тестовый .npz",
            filetypes=[("NPZ files", "*.npz"), ("All files", "*.*")],
        )
        if not file_path:
            return

        metadata_path = self.artifacts_dir / "metadata.json"
        try:
            selected_model_path = resolve_model_path(
                model_path=None, artifacts_dir=self.artifacts_dir
            )
        except FileNotFoundError:
            selected_model_path = None

        if selected_model_path is None or not metadata_path.exists():
            messagebox.showerror(
                "Ошибка",
                "Не найдены artifacts/best_model.keras (или artifacts/model.keras) и artifacts/metadata.json. Сначала обучите модель.",
            )
            return

        self.status_var.set("Обработка тестового набора...")
        self.update_idletasks()

        try:
            result = evaluate_test_file(
                test_npz_path=file_path,
                model_path=None,
                artifacts_dir=self.artifacts_dir,
                metadata_path=metadata_path,
                output_path=self.artifacts_dir / "latest_test_eval.json",
            )
        except Exception as exc:
            messagebox.showerror("Ошибка при оценке", str(exc))
            self.status_var.set("Ошибка при обработке тестового набора")
            return

        self.status_var.set(
            f"Готово ({Path(result['model_path']).name}): "
            f"test_accuracy={result['test_accuracy']:.4f}, test_loss={result['test_loss']:.4f}"
        )
        self.refresh_dashboard()

    def refresh_dashboard(self) -> None:
        history = _read_json_or_none(self.artifacts_dir / "history.json") or {}
        train_stats = _read_json_or_none(self.artifacts_dir / "train_stats.json") or {}
        test_eval = _read_json_or_none(self.artifacts_dir / "latest_test_eval.json") or {}

        val_acc = history.get("val_accuracy", [])
        self.val_acc_chart.render(
            draw_line_chart,
            "Зависимость accuracy на валидации от количества эпох",
            [float(v) for v in val_acc],
            "Эпоха",
            "Accuracy",
        )

        train_dist = train_stats.get("train_distribution", {})
        labels = list(train_dist.keys())
        values = [int(v) for v in train_dist.values()]
        self.train_dist_chart.render(
            draw_horizontal_bar_chart,
            "Количество записей в train по каждому классу",
            labels,
            values,
        )

        valid_dist = train_stats.get("valid_distribution", {})
        top5 = sorted(valid_dist.items(), key=lambda kv: kv[1], reverse=True)[:5]
        top5_labels = [name for name, _ in top5]
        top5_values = [int(v) for _, v in top5]
        self.top5_chart.render(
            draw_horizontal_bar_chart,
            "Top-5 наиболее частых классов в валидационном наборе",
            top5_labels,
            top5_values,
        )

        per_sample = [int(v) for v in test_eval.get("per_sample_correct", [])]
        self.test_record_chart.render(
            draw_binary_series_chart,
            "Точность определения каждой записи тестового набора (0/1)",
            per_sample,
        )

        if test_eval:
            self.loss_var.set(f"Test loss: {float(test_eval['test_loss']):.4f}")
            self.acc_var.set(f"Test accuracy: {float(test_eval['test_accuracy']):.4f}")
        else:
            self.loss_var.set("Test loss: -")
            self.acc_var.set("Test accuracy: -")


class AlienSignalApp(tk.Tk):
    def __init__(self, db_path: str = "artifacts/users.db", artifacts_dir: str = "artifacts"):
        super().__init__()
        self.db_path = db_path
        self.artifacts_dir = artifacts_dir

        init_db(self.db_path)
        ensure_default_admin(self.db_path)

        self.title("Alien Signal Classifier")
        self.geometry("1300x900")
        self.minsize(980, 680)

        self.container = ttk.Frame(self)
        self.container.pack(fill="both", expand=True)

        self._current_frame: ttk.Frame | None = None
        self.show_login()

    def _set_frame(self, frame: ttk.Frame) -> None:
        if self._current_frame is not None:
            self._current_frame.destroy()
        self._current_frame = frame
        self._current_frame.pack(fill="both", expand=True)

    def show_login(self) -> None:
        self._set_frame(LoginFrame(self.container, self))

    def login_success(self, user: User) -> None:
        if user.role == "admin":
            self._set_frame(AdminFrame(self.container, self, user))
        else:
            self._set_frame(UserFrame(self.container, self, user))

    def logout(self) -> None:
        self.show_login()


def run_gui(db_path: str = "artifacts/users.db", artifacts_dir: str = "artifacts") -> None:
    app = AlienSignalApp(db_path=db_path, artifacts_dir=artifacts_dir)
    app.mainloop()
