from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import tensorflow as tf

from app.analytics import class_distribution, per_sample_correct, top_k_frequent_classes
from app.data_utils import ensure_audio_shape, load_test_npz
from app.features import extract_log_mel_in_chunks
from app.label_recovery import encode_labels, mapping_from_dict


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_model_path(
    model_path: str | Path | None = None, artifacts_dir: str | Path = "artifacts"
) -> Path:
    if model_path is not None:
        explicit = Path(model_path)
        if explicit.exists():
            return explicit
        raise FileNotFoundError(f"Model not found: {explicit}")

    artifacts = Path(artifacts_dir)
    candidates = [
        artifacts / "best_model.keras",
        artifacts / "model.keras",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Model not found. Expected one of: {[str(path) for path in candidates]}"
    )


def _try_parse_integer_labels(labels: np.ndarray) -> Optional[np.ndarray]:
    arr = np.asarray(labels)
    if np.issubdtype(arr.dtype, np.integer):
        return arr.astype(np.int64)

    parsed = []
    for value in arr.tolist():
        if isinstance(value, (int, np.integer)):
            parsed.append(int(value))
            continue
        text = str(value).strip()
        if text.isdigit():
            parsed.append(int(text))
            continue
        return None
    return np.asarray(parsed, dtype=np.int64)


def _encode_test_labels(labels: np.ndarray, metadata: Dict[str, Any]) -> np.ndarray:
    mapping = mapping_from_dict(metadata)
    maybe_ids = _try_parse_integer_labels(labels)
    if maybe_ids is not None:
        if maybe_ids.min() < 0 or maybe_ids.max() >= len(mapping.id_to_class):
            raise ValueError("Integer labels are outside expected class range")
        return maybe_ids
    return encode_labels(labels, mapping)


def evaluate_test_file(
    test_npz_path: str | Path,
    model_path: str | Path | None = None,
    artifacts_dir: str | Path = "artifacts",
    metadata_path: str | Path = "artifacts/metadata.json",
    output_path: str | Path = "artifacts/latest_test_eval.json",
) -> Dict[str, Any]:
    selected_model_path = resolve_model_path(model_path=model_path, artifacts_dir=artifacts_dir)
    model = tf.keras.models.load_model(selected_model_path)
    metadata = _read_json(Path(metadata_path))
    mapping = mapping_from_dict(metadata)

    test_data = load_test_npz(test_npz_path)
    test_x = ensure_audio_shape(test_data.test_x)
    test_y = _encode_test_labels(test_data.test_y, metadata)

    test_features = extract_log_mel_in_chunks(test_x, chunk_size=64)
    loss, accuracy = model.evaluate(test_features, test_y, verbose=0)

    probs = model.predict(test_features, verbose=0)
    pred_ids = np.argmax(probs, axis=1).astype(np.int64)

    sample_correct = per_sample_correct(test_y, pred_ids)

    payload = {
        "test_file": str(test_npz_path),
        "model_path": str(selected_model_path),
        "test_loss": float(loss),
        "test_accuracy": float(accuracy),
        "num_samples": int(len(test_y)),
        "y_true": test_y.astype(int).tolist(),
        "y_pred": pred_ids.astype(int).tolist(),
        "per_sample_correct": sample_correct,
        "true_distribution": class_distribution(test_y, mapping.id_to_class),
        "pred_distribution": class_distribution(pred_ids, mapping.id_to_class),
        "top5_true_classes": top_k_frequent_classes(test_y, mapping.id_to_class, k=5),
    }
    _write_json(Path(output_path), payload)
    return payload
