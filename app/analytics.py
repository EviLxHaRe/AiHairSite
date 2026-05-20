from __future__ import annotations

from collections import Counter
from typing import Dict, List, Sequence

import numpy as np


def class_distribution(y_ids: Sequence[int], class_names: Sequence[str]) -> Dict[str, int]:
    counts = Counter(int(v) for v in y_ids)
    return {class_names[idx]: counts.get(idx, 0) for idx in range(len(class_names))}


def top_k_frequent_classes(
    y_ids: Sequence[int], class_names: Sequence[str], k: int = 5
) -> List[dict]:
    distribution = class_distribution(y_ids, class_names)
    sorted_items = sorted(distribution.items(), key=lambda kv: kv[1], reverse=True)
    return [{"class_name": name, "count": int(count)} for name, count in sorted_items[:k]]


def per_sample_correct(y_true: Sequence[int], y_pred: Sequence[int]) -> List[int]:
    true_arr = np.asarray(y_true, dtype=np.int64)
    pred_arr = np.asarray(y_pred, dtype=np.int64)
    if true_arr.shape != pred_arr.shape:
        raise ValueError("Shapes of y_true and y_pred must match")
    return (true_arr == pred_arr).astype(np.int64).tolist()


def history_curve(history: dict, metric_name: str) -> List[float]:
    return [float(v) for v in history.get(metric_name, [])]
