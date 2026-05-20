import tempfile
import unittest
from pathlib import Path

from app.auth_db import authenticate, create_user, ensure_default_admin, init_db, list_users


class AuthDbTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "users.db"
        init_db(self.db_path)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_create_and_authenticate_user(self):
        created = create_user(
            self.db_path,
            username="user1",
            password="pass123",
            first_name="Ivan",
            last_name="Petrov",
            role="user",
        )
        self.assertTrue(created)

        user = authenticate(self.db_path, "user1", "pass123")
        self.assertIsNotNone(user)
        self.assertEqual(user.username, "user1")
        self.assertEqual(user.role, "user")

        wrong = authenticate(self.db_path, "user1", "wrong")
        self.assertIsNone(wrong)

    def test_duplicate_username(self):
        create_user(
            self.db_path,
            username="same",
            password="pass1",
            first_name="A",
            last_name="B",
            role="user",
        )
        created_second = create_user(
            self.db_path,
            username="same",
            password="pass2",
            first_name="C",
            last_name="D",
            role="user",
        )
        self.assertFalse(created_second)

    def test_ensure_default_admin(self):
        ensure_default_admin(self.db_path)
        users = list_users(self.db_path)
        self.assertTrue(any(user.role == "admin" for user in users))


if __name__ == "__main__":
    unittest.main()
