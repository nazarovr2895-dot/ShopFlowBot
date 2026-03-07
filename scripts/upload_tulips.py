#!/usr/bin/env python3
"""One-time script to bulk-upload tulip products to Flurai seller panel."""

import os
import sys
import time

import requests

# --- Configuration ---
BASE_URL = "https://api.flurai.ru"
PHOTO_DIR = "/Users/rus/Pictures/Seller"
LOGIN = "Seller1234"
PASSWORD = "Seller1234"
STOCK_QUANTITY = 10
TOKEN_REFRESH_BUFFER = 25 * 60  # refresh after 25 min (token lives 30 min)

VARIATIONS = [
    (9, 1200),
    (15, 2100),
    (25, 3500),
    (49, 6800),
    (101, 13500),
]

# (filename, display_name, genitive for product name)
PHOTOS = [
    ("5282864767301261037.jpg", "Оранжевые тюльпаны", "оранжевых тюльпанов"),
    ("5282864767301261038.jpg", "Красные тюльпаны", "красных тюльпанов"),
    ("5282864767301261039.jpg", "Жёлтые тюльпаны", "жёлтых тюльпанов"),
    ("5282864767301261040.jpg", "Белые тюльпаны", "белых тюльпанов"),
    ("5282864767301261041.jpg", "Ярко-розовые тюльпаны", "ярко-розовых тюльпанов"),
    ("5282864767301261042.jpg", "Нежно-розовые тюльпаны", "нежно-розовых тюльпанов"),
    ("5282864767301261043.jpg", "Фиолетовые пионовидные тюльпаны", "фиолетовых пионовидных тюльпанов"),
    ("5282864767301261044.jpg", "Розовые пионовидные тюльпаны", "розовых пионовидных тюльпанов"),
    ("5282864767301261048.jpg", "Лавандовые пионовидные тюльпаны", "лавандовых пионовидных тюльпанов"),
    ("5282864767301261050.jpg", "Малиновые тюльпаны", "малиновых тюльпанов"),
    ("5282864767301261079.jpg", "Розовые тюльпаны", "розовых тюльпанов"),
    ("5282864767301261080.jpg", "Бордовые тюльпаны", "бордовых тюльпанов"),
    ("5282864767301261081.jpg", "Красно-жёлтые тюльпаны", "красно-жёлтых тюльпанов"),
    ("5282864767301261082.jpg", "Розово-белые тюльпаны", "розово-белых тюльпанов"),
]


class SellerAPI:
    def __init__(self, base_url, login, password):
        self.base_url = base_url.rstrip("/")
        self.login_creds = {"login": login, "password": password}
        self.session = requests.Session()
        self.token = None
        self.refresh_token = None
        self.seller_id = None
        self.token_time = 0

    def authenticate(self):
        resp = self.session.post(f"{self.base_url}/seller-web/login", json=self.login_creds)
        resp.raise_for_status()
        data = resp.json()
        self.token = data["token"]
        self.refresh_token = data.get("refresh_token")
        self.seller_id = data["seller_id"]
        self.token_time = time.time()
        self.session.headers["X-Seller-Token"] = self.token

    def _maybe_refresh(self):
        if time.time() - self.token_time < TOKEN_REFRESH_BUFFER:
            return
        if not self.refresh_token:
            return
        resp = self.session.post(
            f"{self.base_url}/seller-web/refresh",
            json={"refresh_token": self.refresh_token},
        )
        if resp.status_code == 200:
            data = resp.json()
            self.token = data["token"]
            self.refresh_token = data["refresh_token"]
            self.token_time = time.time()
            self.session.headers["X-Seller-Token"] = self.token
            print("  [Token refreshed]")

    def _request(self, method, path, **kwargs):
        self._maybe_refresh()
        resp = self.session.request(method, f"{self.base_url}{path}", **kwargs)
        if resp.status_code == 401 and self.refresh_token:
            self._maybe_refresh()
            resp = self.session.request(method, f"{self.base_url}{path}", **kwargs)
        return resp

    def upload_photo(self, filepath):
        with open(filepath, "rb") as f:
            resp = self._request(
                "POST",
                "/seller-web/upload-photo",
                files={"file": (os.path.basename(filepath), f, "image/jpeg")},
            )
        resp.raise_for_status()
        return resp.json()["photo_id"]

    def create_product(self, name, description, price, photo_ids, quantity):
        resp = self._request(
            "POST",
            "/seller-web/products",
            json={
                "seller_id": self.seller_id,
                "name": name,
                "description": description,
                "price": price,
                "photo_ids": photo_ids,
                "quantity": quantity,
            },
        )
        resp.raise_for_status()
        return resp.json()

    def get_products(self):
        resp = self._request("GET", "/seller-web/products")
        resp.raise_for_status()
        return resp.json()

    def update_product(self, product_id, photo_ids):
        resp = self._request(
            "PUT",
            f"/seller-web/products/{product_id}",
            json={"photo_ids": photo_ids},
        )
        resp.raise_for_status()
        return resp.json()


GENERAL_PHOTOS = [
    "/Users/rus/Pictures/Seller/Generalfoto/square-image.jpg",
    "/Users/rus/Pictures/Seller/Generalfoto/square-image 2.jpg",
]


def add_general_photos():
    """Add 2 general photos to all existing products."""
    api = SellerAPI(BASE_URL, LOGIN, PASSWORD)

    print("Logging in...")
    try:
        api.authenticate()
    except requests.HTTPError as e:
        print(f"Login failed: {e}")
        sys.exit(1)
    print(f"OK — seller_id={api.seller_id}\n")

    # Upload 2 general photos once
    general_ids = []
    for filepath in GENERAL_PHOTOS:
        try:
            photo_id = api.upload_photo(filepath)
            general_ids.append(photo_id)
            print(f"General photo uploaded: {photo_id}")
        except Exception as e:
            print(f"FATAL: Failed to upload {filepath}: {e}")
            sys.exit(1)

    # Get all products and update each
    products = api.get_products()
    print(f"\nUpdating {len(products)} products...\n")

    updated = 0
    failed = 0
    for i, p in enumerate(products, 1):
        pid = p["id"]
        name = p["name"]
        current_photos = p.get("photo_ids") or ([p["photo_id"]] if p.get("photo_id") else [])
        new_photos = (current_photos + general_ids)[:3]
        try:
            api.update_product(pid, new_photos)
            print(f"[{i}/{len(products)}] id={pid} {name} — OK ({len(new_photos)} photos)")
            updated += 1
        except Exception as e:
            print(f"[{i}/{len(products)}] id={pid} {name} — FAILED: {e}")
            failed += 1

    print(f"\n{'=' * 50}")
    print(f"Done! Updated: {updated}, Failed: {failed}")


def main():
    api = SellerAPI(BASE_URL, LOGIN, PASSWORD)

    print("Logging in...")
    try:
        api.authenticate()
    except requests.HTTPError as e:
        print(f"Login failed: {e}")
        sys.exit(1)
    print(f"OK — seller_id={api.seller_id}\n")

    created = 0
    failed = 0
    errors = []

    for i, (filename, display_name, genitive) in enumerate(PHOTOS, 1):
        filepath = os.path.join(PHOTO_DIR, filename)
        print(f"[{i}/{len(PHOTOS)}] {display_name} ({filename})")

        # Upload photo
        try:
            photo_id = api.upload_photo(filepath)
            print(f"  Photo: {photo_id}")
        except Exception as e:
            msg = f"  SKIP — upload failed: {e}"
            print(msg)
            errors.append(f"{filename}: {e}")
            failed += len(VARIATIONS)
            continue

        # Create 5 variations
        for j, (count, price) in enumerate(VARIATIONS, 1):
            name = f"Букет из {count} {genitive}"
            description = (
                f"Свежий букет из {count} {genitive}. "
                f"Собран вручную из отборных цветов. "
                f"Идеальный подарок на любой праздник."
            )
            try:
                result = api.create_product(name, description, price, [photo_id], STOCK_QUANTITY)
                pid = result.get("id", "?")
                print(f"  [{j}/5] {name} — {price}₽ → id={pid}")
                created += 1
            except Exception as e:
                print(f"  [{j}/5] {name} — FAILED: {e}")
                errors.append(f"{name}: {e}")
                failed += 1

    print(f"\n{'=' * 50}")
    print(f"Done! Created: {created}, Failed: {failed}")
    if errors:
        print(f"\nErrors ({len(errors)}):")
        for err in errors:
            print(f"  - {err}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "add-photos":
        add_general_photos()
    else:
        main()
