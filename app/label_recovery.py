from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

import numpy as np

_HEX_PREFIX_RE = re.compile(r"^[0-9a-f]{32}")


@dataclass(frozen=True)
class LabelMapping:
    class_to_id: Dict[str, int]
    id_to_class: List[str]


def clean_label(raw_label: Any) -> str:
    """Remove damaged hash-like prefix from label and return canonical class name."""
    if isinstance(raw_label, bytes):
        raw_label = raw_label.decode("utf-8", errors="ignore")
    label = str(raw_label).strip()
    if _HEX_PREFIX_RE.match(label):
        return label[32:]
    return label


def _flatten_labels(label_arrays: Iterable[np.ndarray]) -> List[str]:
    flattened: List[str] = []
    for labels in label_arrays:
        arr = np.asarray(labels)
        if arr.size == 0:
            continue
        flattened.extend(clean_label(v) for v in arr.tolist())
    return flattened


def build_label_mapping(*label_arrays: np.ndarray) -> LabelMapping:
    """Build deterministic mapping class_name -> class_id (0..N-1)."""
    cleaned = _flatten_labels(label_arrays)
    if not cleaned:
        raise ValueError("Cannot build label mapping from empty arrays")

    unique_classes = sorted(set(cleaned))
    class_to_id = {class_name: idx for idx, class_name in enumerate(unique_classes)}
    return LabelMapping(class_to_id=class_to_id, id_to_class=unique_classes)


def encode_labels(labels: np.ndarray, mapping: LabelMapping) -> np.ndarray:
    """Encode raw labels into consecutive integer ids."""
    encoded: List[int] = []
    for raw in np.asarray(labels).tolist():
        clean = clean_label(raw)
        if clean not in mapping.class_to_id:
            raise KeyError(f"Unknown class label: {clean}")
        encoded.append(mapping.class_to_id[clean])
    return np.asarray(encoded, dtype=np.int64)


def decode_labels(label_ids: np.ndarray, mapping: LabelMapping) -> np.ndarray:
    """Decode integer ids back to class names."""
    ids = np.asarray(label_ids, dtype=np.int64)
    names = [mapping.id_to_class[idx] for idx in ids.tolist()]
    return np.asarray(names, dtype=object)


def mapping_to_dict(mapping: LabelMapping) -> Dict[str, Any]:
    return {
        "class_to_id": mapping.class_to_id,
        "id_to_class": mapping.id_to_class,
        "num_classes": len(mapping.id_to_class),
    }


def mapping_from_dict(data: Dict[str, Any]) -> LabelMapping:
    class_to_id = {str(k): int(v) for k, v in data["class_to_id"].items()}
    id_to_class = [str(v) for v in data["id_to_class"]]
    return LabelMapping(class_to_id=class_to_id, id_to_class=id_to_class)
