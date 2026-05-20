from __future__ import annotations

from typing import Iterable, Tuple

import librosa
import numpy as np
import tensorflow as tf


DEFAULT_SAMPLE_RATE = 16_000
DEFAULT_TARGET_SIZE = (96, 96)
DEFAULT_N_MELS = 96


def _normalize_spectrogram(spec: np.ndarray) -> np.ndarray:
    mean = spec.mean()
    std = spec.std()
    return (spec - mean) / (std + 1e-6)


def _extract_single(
    signal: np.ndarray,
    sample_rate: int,
    n_mels: int,
    target_size: Tuple[int, int],
    n_fft: int,
    hop_length: int,
) -> np.ndarray:
    y = np.asarray(signal, dtype=np.float32).reshape(-1)
    mel = librosa.feature.melspectrogram(
        y=y,
        sr=sample_rate,
        n_mels=n_mels,
        n_fft=n_fft,
        hop_length=hop_length,
    )
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_db = _normalize_spectrogram(mel_db)
    mel_img = tf.image.resize(mel_db[..., np.newaxis], target_size).numpy()
    return mel_img.astype(np.float32)


def extract_log_mel_batch(
    audio_batch: np.ndarray,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    n_mels: int = DEFAULT_N_MELS,
    target_size: Tuple[int, int] = DEFAULT_TARGET_SIZE,
    n_fft: int = 1024,
    hop_length: int = 256,
) -> np.ndarray:
    features = [
        _extract_single(sample, sample_rate, n_mels, target_size, n_fft, hop_length)
        for sample in np.asarray(audio_batch)
    ]
    return np.stack(features, axis=0).astype(np.float32)


def extract_log_mel_in_chunks(
    audio_batch: np.ndarray,
    chunk_size: int = 64,
    **kwargs,
) -> np.ndarray:
    """Extract features in chunks to keep memory usage predictable."""
    batch = np.asarray(audio_batch)
    total = len(batch)
    chunks: Iterable[np.ndarray] = (
        batch[idx : idx + chunk_size] for idx in range(0, total, chunk_size)
    )
    out = [extract_log_mel_batch(chunk, **kwargs) for chunk in chunks]
    return np.concatenate(out, axis=0)
