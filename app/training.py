from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import tensorflow as tf

from app.analytics import class_distribution
from app.data_utils import load_train_valid_npz, train_valid_split_arrays
from app.features import extract_log_mel_in_chunks
from app.label_recovery import build_label_mapping, encode_labels, mapping_to_dict
from app.modeling import build_cnn_model


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def train(
    data_path: str | Path,
    artifacts_dir: str | Path = "artifacts",
    epochs: int = 30,
    batch_size: int = 32,
    seed: int = 42,
) -> Dict[str, Any]:
    np.random.seed(seed)
    tf.random.set_seed(seed)

    artifacts = Path(artifacts_dir)
    artifacts.mkdir(parents=True, exist_ok=True)

    data = load_train_valid_npz(data_path)
    train_x, train_y_raw, valid_x, valid_y_raw = train_valid_split_arrays(data)

    mapping = build_label_mapping(train_y_raw, valid_y_raw)
    train_y = encode_labels(train_y_raw, mapping)
    valid_y = encode_labels(valid_y_raw, mapping)

    train_features = extract_log_mel_in_chunks(train_x, chunk_size=64)
    valid_features = extract_log_mel_in_chunks(valid_x, chunk_size=64)

    model = build_cnn_model(
        input_shape=train_features.shape[1:],
        num_classes=len(mapping.id_to_class),
    )

    model_path = artifacts / "model.keras"
    best_model_path = artifacts / "best_model.keras"
    metadata_path = artifacts / "metadata.json"
    history_path = artifacts / "history.json"
    train_stats_path = artifacts / "train_stats.json"

    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            filepath=str(best_model_path),
            monitor="val_accuracy",
            mode="max",
            save_best_only=True,
            verbose=0,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=6,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=3,
            min_lr=1e-5,
        ),
    ]

    history = model.fit(
        train_features,
        train_y,
        validation_data=(valid_features, valid_y),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    best_model = model
    if best_model_path.exists():
        best_model = tf.keras.models.load_model(best_model_path)

    val_loss, val_accuracy = best_model.evaluate(valid_features, valid_y, verbose=0)
    # Keep backward compatibility for code that expects artifacts/model.keras.
    best_model.save(model_path)

    metadata = {
        **mapping_to_dict(mapping),
        "input_shape": list(train_features.shape[1:]),
        "sample_rate": 16000,
        "feature_type": "log_mel",
    }
    _write_json(metadata_path, metadata)

    history_payload = {k: [float(v) for v in values] for k, values in history.history.items()}
    _write_json(history_path, history_payload)
    val_acc_history = history_payload.get("val_accuracy", [])
    best_epoch = int(np.argmax(val_acc_history) + 1) if val_acc_history else 0
    best_val_accuracy = float(max(val_acc_history)) if val_acc_history else float(val_accuracy)

    train_distribution = class_distribution(train_y, mapping.id_to_class)
    valid_distribution = class_distribution(valid_y, mapping.id_to_class)
    train_stats = {
        "epochs_trained": len(history_payload.get("loss", [])),
        "best_epoch": best_epoch,
        "best_val_accuracy": best_val_accuracy,
        "final_val_loss": float(val_loss),
        "final_val_accuracy": float(val_accuracy),
        "train_distribution": train_distribution,
        "valid_distribution": valid_distribution,
        "num_train": int(len(train_y)),
        "num_valid": int(len(valid_y)),
    }
    _write_json(train_stats_path, train_stats)

    return {
        "model_path": str(model_path),
        "best_model_path": str(best_model_path),
        "metadata_path": str(metadata_path),
        "history_path": str(history_path),
        "train_stats_path": str(train_stats_path),
        "val_loss": float(val_loss),
        "val_accuracy": float(val_accuracy),
    }
