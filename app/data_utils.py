from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

import numpy as np


@dataclass
class TrainValidData:
    train_x: np.ndarray
    train_y: np.ndarray
    valid_x: np.ndarray
    valid_y: np.ndarray


@dataclass
class TestData:
    test_x: np.ndarray
    test_y: np.ndarray


def _select_validation_labels(data: np.lib.npyio.NpzFile, valid_len: int) -> np.ndarray:
    if "valid_y" in data and len(data["valid_y"]) == valid_len:
        return data["valid_y"]
    if "vaild_y" in data and len(data["vaild_y"]) == valid_len:
        return data["vaild_y"]
    raise KeyError("Validation labels not found or have invalid length")


def load_train_valid_npz(npz_path: str | Path) -> TrainValidData:
    path = Path(npz_path)
    with np.load(path, allow_pickle=True) as data:
        required = {"train_x", "train_y", "valid_x"}
        missing = required.difference(set(data.files))
        if missing:
            raise KeyError(f"Missing required arrays in {path}: {sorted(missing)}")

        train_x = data["train_x"]
        train_y = data["train_y"]
        valid_x = data["valid_x"]
        valid_y = _select_validation_labels(data, len(valid_x))

    return TrainValidData(train_x=train_x, train_y=train_y, valid_x=valid_x, valid_y=valid_y)


def load_test_npz(npz_path: str | Path) -> TestData:
    path = Path(npz_path)
    with np.load(path, allow_pickle=True) as data:
        required = {"test_x", "test_y"}
        missing = required.difference(set(data.files))
        if missing:
            raise KeyError(f"Missing required arrays in {path}: {sorted(missing)}")

        test_x = data["test_x"]
        test_y = data["test_y"]

    return TestData(test_x=test_x, test_y=test_y)


def ensure_audio_shape(audio: np.ndarray) -> np.ndarray:
    arr = np.asarray(audio, dtype=np.float32)
    if arr.ndim == 3 and arr.shape[-1] == 1:
        return arr
    if arr.ndim == 2:
        return arr[..., np.newaxis]
    raise ValueError(f"Unexpected audio array shape: {arr.shape}")


def train_valid_split_arrays(data: TrainValidData) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    return (
        ensure_audio_shape(data.train_x),
        np.asarray(data.train_y),
        ensure_audio_shape(data.valid_x),
        np.asarray(data.valid_y),
    )
