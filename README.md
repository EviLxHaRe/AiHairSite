# PredProf

Проект решает задачу классификации радиосигналов инопланетных цивилизаций:
- восстанавливает повреждённые метки классов;
- обучает CNN-модель (без использования готовых pretrained-моделей);
- предоставляет GUI с авторизацией и аналитикой;
- хранит пользователей в SQLite.

## Что реализовано

1. Восстановление меток классов:
- у меток удаляется повреждённый 32-символьный hex-префикс;
- формируется отображение `class_name -> class_id` от `0` до `N-1`.

2. Обучение модели:
- вход: `Data.npz` (`train_x`, `train_y`, `valid_x`, `valid_y`/`vaild_y`);
- признаки: log-mel спектрограммы;
- модель: CNN на `tensorflow.keras`;
- сохранение артефактов:
  - `artifacts/best_model.keras` (лучшая по `val_accuracy`)
  - `artifacts/model.keras`
  - `artifacts/metadata.json`
  - `artifacts/history.json`
  - `artifacts/train_stats.json`

3. GUI (tkinter):
- авторизация пользователей;
- роли: `admin` и `user`;
- администратор создаёт пользователей (Имя, Фамилия, логин, пароль, роль);
- пользователь загружает тестовый `.npz` и видит:
  - точность на валидации по эпохам;
  - распределение train по классам;
  - точность по каждой записи test (0/1);
  - топ-5 самых частых классов valid;
  - `test loss` и `test accuracy`.
- при оценке автоматически используется лучшая модель:
  сначала `artifacts/best_model.keras`, если её нет — `artifacts/model.keras`.
- графики масштабируются колесом мыши.

4. Персистентность:
- пользователи и роли хранятся в `artifacts/users.db` (SQLite).

5. Unit-тесты:
- проверка восстановления меток;
- проверка БД/авторизации;
- проверка аналитических функций.

## Структура

- `app/label_recovery.py` — восстановление и кодирование меток
- `app/features.py` — извлечение признаков
- `app/modeling.py` — архитектура CNN
- `app/training.py` — обучение и сохранение артефактов
- `app/evaluation.py` — оценка на тестовом наборе
- `app/auth_db.py` — БД пользователей и авторизация
- `app/gui.py` — графический интерфейс
- `scripts/train_model.py` — запуск обучения
- `scripts/run_app.py` — запуск GUI
- `tests/` — unit-тесты

## Запуск

## 1. Обучение

```bash
./myenv/bin/python scripts/train_model.py --data Data.npz --epochs 30 --batch-size 32 --artifacts artifacts
```

## 2. Запуск GUI

```bash
./myenv/bin/python scripts/run_app.py --db artifacts/users.db --artifacts artifacts
```

Дефолтный администратор:
- логин: `admin`
- пароль: `admin123`

## 3. Unit-тесты

```bash
./myenv/bin/python -m unittest discover -s tests -v
```

## Демонстрация по регламенту

1. Показать запуск обучения и логи (`scripts/train_model.py`).
2. Показать сохранённые артефакты в `artifacts/`.
3. Запустить GUI (`scripts/run_app.py`).
4. Войти под `admin`, создать пользователя по данным жюри.
5. Войти под созданным `user`.
6. Загрузить тестовый `.npz` через форму.
7. Показать `test accuracy`, `test loss` и диаграммы.
8. Показать БД `artifacts/users.db` (персистентность).
9. Запустить unit-тесты.
