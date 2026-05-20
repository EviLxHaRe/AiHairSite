import unittest

from app.analytics import class_distribution, per_sample_correct, top_k_frequent_classes


class AnalyticsTests(unittest.TestCase):
    def test_class_distribution(self):
        y = [0, 1, 1, 2, 2, 2]
        names = ["A", "B", "C"]
        dist = class_distribution(y, names)
        self.assertEqual(dist, {"A": 1, "B": 2, "C": 3})

    def test_top_k(self):
        y = [0, 0, 1, 1, 1, 2]
        names = ["A", "B", "C"]
        top = top_k_frequent_classes(y, names, k=2)
        self.assertEqual(top[0]["class_name"], "B")
        self.assertEqual(top[0]["count"], 3)
        self.assertEqual(len(top), 2)

    def test_per_sample_correct(self):
        y_true = [1, 2, 3, 4]
        y_pred = [1, 0, 3, 5]
        self.assertEqual(per_sample_correct(y_true, y_pred), [1, 0, 1, 0])


if __name__ == "__main__":
    unittest.main()
