"""
start_backend.py
Convenience script to install deps into the local venv and launch the server.
Run from the project root:
    python start_backend.py
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
VENV = ROOT / "venv"
BACKEND = ROOT / "backend"

PIP = VENV / "Scripts" / "pip.exe" if sys.platform == "win32" else VENV / "bin" / "pip"
UV = VENV / "Scripts" / "uvicorn.exe" if sys.platform == "win32" else VENV / "bin" / "uvicorn"


def main() -> None:
    print("📦 Installing backend dependencies…")
    subprocess.run(
        [str(PIP), "install", "-r", str(BACKEND / "requirements.txt"), "--quiet"],
        check=True,
    )
    print("🚀 Starting server on http://localhost:8000")
    subprocess.run(
        [
            str(UV),
            "server:app",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--reload",
            "--log-level", "info",
        ],
        cwd=str(BACKEND),
        check=True,
    )


if __name__ == "__main__":
    main()
