#!/usr/bin/env python3
"""Local-only face detection and embedding worker for Immich Mini."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import cv2
import numpy as np


class FaceEngine:
    def __init__(self, detector_path: Path, recognizer_path: Path, crop_dir: Path) -> None:
        self.detector_path = detector_path
        self.recognizer_path = recognizer_path
        self.crop_dir = crop_dir
        self.detector: Any = None
        self.recognizer: Any = None
        self.lock = threading.Lock()

    def _load(self) -> None:
        if self.detector is not None and self.recognizer is not None:
            return
        if not self.detector_path.is_file():
            raise RuntimeError(f"Missing detector model: {self.detector_path}")
        if not self.recognizer_path.is_file():
            raise RuntimeError(f"Missing recognizer model: {self.recognizer_path}")
        self.detector = cv2.FaceDetectorYN.create(
            str(self.detector_path),
            "",
            (320, 320),
            score_threshold=0.7,
            nms_threshold=0.3,
            top_k=5000,
        )
        self.recognizer = cv2.FaceRecognizerSF.create(str(self.recognizer_path), "")
        self.crop_dir.mkdir(parents=True, exist_ok=True)

    def analyze(self, image_path: Path, min_score: float, marker: str) -> dict[str, Any]:
        with self.lock:
            self._load()
            encoded = np.fromfile(str(image_path), dtype=np.uint8)
            image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
            if image is None:
                raise RuntimeError("Unable to decode image")
            height, width = image.shape[:2]
            if width * height > 80_000_000:
                raise RuntimeError("Image exceeds the 80 megapixel safety limit")
            if not 0.1 <= min_score <= 0.99:
                raise RuntimeError("Face detection threshold must be between 0.1 and 0.99")

            self.detector.setScoreThreshold(min_score)
            self.detector.setInputSize((width, height))
            _, detected = self.detector.detect(image)
            faces: list[dict[str, Any]] = []
            if detected is not None:
                for index, face in enumerate(detected):
                    score = float(face[-1])
                    if score < min_score:
                        continue
                    x, y, face_width, face_height = (float(value) for value in face[:4])
                    aligned = self.recognizer.alignCrop(image, face)
                    feature = np.asarray(self.recognizer.feature(aligned), dtype=np.float32).reshape(-1)
                    norm = np.linalg.norm(feature)
                    if norm > 0:
                        feature = feature / norm

                    padding = max(face_width, face_height) * 0.18
                    x1 = max(0, int(x - padding))
                    y1 = max(0, int(y - padding))
                    x2 = min(width, int(x + face_width + padding))
                    y2 = min(height, int(y + face_height + padding))
                    crop = image[y1:y2, x1:x2]
                    crop_name = f"{marker}-{index}.jpg"
                    crop_path = self.crop_dir / crop_name
                    if crop.size > 0:
                        ok, buffer = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
                        if ok:
                            crop_path.write_bytes(buffer.tobytes())

                    faces.append(
                        {
                            "boundingBox": {
                                "x1": max(0.0, x),
                                "y1": max(0.0, y),
                                "x2": min(float(width), x + face_width),
                                "y2": min(float(height), y + face_height),
                            },
                            "cropPath": str(crop_path) if crop_path.is_file() else None,
                            "embedding": feature.tolist(),
                            "score": score,
                        }
                    )

            return {"faces": faces, "height": height, "width": width}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--detector-model", required=True)
    parser.add_argument("--recognizer-model", required=True)
    parser.add_argument("--crop-dir", required=True)
    parser.add_argument("--allowed-root", action="append", default=[])
    parser.add_argument("--idle-seconds", type=int, default=45)
    parser.add_argument("--token", required=True)
    return parser.parse_args()


def is_allowed(path: Path, roots: list[Path]) -> bool:
    resolved = path.resolve()
    return any(resolved == root or root in resolved.parents for root in roots)


def main() -> int:
    args = parse_args()
    roots = [Path(value).resolve() for value in args.allowed_root]
    engine = FaceEngine(Path(args.detector_model), Path(args.recognizer_model), Path(args.crop_dir))
    last_activity = time.monotonic()

    class Handler(BaseHTTPRequestHandler):
        server_version = "ImmichMiniFace/1.0"

        def log_message(self, _format: str, *_args: Any) -> None:
            return

        def send_json(self, status: int, body: dict[str, Any]) -> None:
            encoded = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def authorized(self) -> bool:
            return self.headers.get("X-Immich-Mini-Token") == args.token

        def do_GET(self) -> None:
            nonlocal last_activity
            if self.path != "/health":
                self.send_json(404, {"error": "not_found"})
                return
            last_activity = time.monotonic()
            self.send_json(200, {"loaded": engine.detector is not None, "ok": True, "pid": os.getpid()})

        def do_POST(self) -> None:
            nonlocal last_activity
            if self.path != "/analyze" or not self.authorized():
                self.send_json(404, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 1_000_000:
                    raise RuntimeError("Invalid request size")
                payload = json.loads(self.rfile.read(length))
                image_path = Path(payload["imagePath"])
                if not is_allowed(image_path, roots):
                    raise RuntimeError("Image path is outside configured library roots")
                last_activity = time.monotonic()
                result = engine.analyze(
                    image_path,
                    float(payload.get("minScore", 0.7)),
                    str(payload["marker"]),
                )
                last_activity = time.monotonic()
                self.send_json(200, result)
            except Exception as error:
                self.send_json(400, {"error": str(error)})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)

    def idle_monitor() -> None:
        while True:
            time.sleep(2)
            if time.monotonic() - last_activity >= args.idle_seconds:
                server.shutdown()
                return

    threading.Thread(target=idle_monitor, daemon=True).start()
    print(json.dumps({"ready": True, "port": server.server_address[1], "pid": os.getpid()}), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
