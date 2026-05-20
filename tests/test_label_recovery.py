import unittest

import numpy as np

from app.label_recovery import build_label_mapping, clean_label, encode_labels


class LabelRecoveryTests(unittest.TestCase):
    def test_clean_label_removes_hex_prefix(self):
        raw = "0123456789abcdef0123456789abcdefKepler-62f"
        self.assertEqual(clean_label(raw), "Kepler-62f")

    def test_mapping_and_encoding(self):
        train = np.array(
            [
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaClassA",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbClassB",
                "ccccccccccccccccccccccccccccccccClassA",
            ],
            dtype=object,
        )
        valid = np.array(["ddddddddddddddddddddddddddddddddClassB"], dtype=object)

        mapping = build_label_mapping(train, valid)
        encoded = encode_labels(train, mapping)

        self.assertEqual(mapping.id_to_class, ["ClassA", "ClassB"])
        self.assertTrue(np.array_equal(encoded, np.array([0, 1, 0], dtype=np.int64)))

    def test_encode_raises_for_unknown_class(self):
        mapping = build_label_mapping(np.array(["x"], dtype=object))
        with self.assertRaises(KeyError):
            encode_labels(np.array(["y"], dtype=object), mapping)


if __name__ == "__main__":
    unittest.main()
