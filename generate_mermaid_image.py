#!/usr/bin/env python3
"""
Generate an image from a Mermaid .mmd file.

Default input:  system-overview.mmd
Default output: system-overview.png

Usage examples:
  python generate_mermaid_image.py
  python generate_mermaid_image.py --input system-overview.mmd --output system-overview.png
  python generate_mermaid_image.py --input system-overview.mmd --output system-overview.svg
"""

from __future__ import annotations

import argparse
import base64
import pathlib
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import zlib


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render Mermaid .mmd file to image via Kroki or Mermaid CLI."
    )
    parser.add_argument(
        "--input",
        default="system-overview.mmd",
        help="Path to Mermaid input file (.mmd). Default: system-overview.mmd",
    )
    parser.add_argument(
        "--output",
        default="system-overview.png",
        help="Output image path (.png, .svg, .pdf). Default: system-overview.png",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="HTTP timeout in seconds. Default: 30",
    )
    parser.add_argument(
        "--engine",
        choices=("auto", "kroki", "mmdc"),
        default="auto",
        help="Rendering engine: auto, kroki, or mmdc. Default: auto",
    )
    parser.add_argument(
        "--kroki-url",
        default="https://kroki.io",
        help="Base URL for Kroki server. Default: https://kroki.io",
    )
    return parser.parse_args()


def detect_format(output_path: pathlib.Path) -> str:
    ext = output_path.suffix.lower().lstrip(".")
    allowed = {"png", "svg", "pdf"}
    if ext not in allowed:
        raise ValueError(
            f"Unsupported output format '.{ext}'. Use one of: {', '.join(sorted(allowed))}."
        )
    return ext


def render_with_kroki(
    mermaid_text: str,
    image_format: str,
    timeout: int,
    kroki_url: str,
) -> bytes:
    base_url = kroki_url.rstrip("/")
    post_url = f"{base_url}/mermaid/{image_format}"
    accept = "image/svg+xml" if image_format == "svg" else f"image/{image_format}"
    headers = {
        "Content-Type": "text/plain; charset=utf-8",
        "Accept": accept,
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
    }

    post_req = urllib.request.Request(
        post_url,
        data=mermaid_text.encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(post_req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        # Some networks/proxies block POST; retry using Kroki GET-encoded mode.
        if err.code != 403:
            raise

    compressed = zlib.compress(mermaid_text.encode("utf-8"), 9)
    encoded = base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")
    get_url = f"{base_url}/mermaid/{image_format}/{encoded}"
    get_req = urllib.request.Request(get_url, headers=headers, method="GET")
    with urllib.request.urlopen(get_req, timeout=timeout) as resp:
        return resp.read()


def _find_mmdc_command() -> list[str] | None:
    mmdc = shutil.which("mmdc")
    if mmdc:
        return [mmdc]

    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if npx:
        # -y auto-confirms package download if not installed yet.
        return [npx, "-y", "@mermaid-js/mermaid-cli"]

    return None


def render_with_mmdc(
    input_path: pathlib.Path,
    output_path: pathlib.Path,
    timeout: int,
) -> None:
    base_cmd = _find_mmdc_command()
    if not base_cmd:
        raise FileNotFoundError(
            "Neither 'mmdc' nor 'npx' found. Install Mermaid CLI or Node.js."
        )

    cmd = [*base_cmd, "-i", str(input_path), "-o", str(output_path)]
    completed = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )

    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        stdout = (completed.stdout or "").strip()
        detail = stderr or stdout or "unknown error"
        raise RuntimeError(f"Mermaid CLI failed: {detail}")


def main() -> int:
    args = parse_args()

    input_path = pathlib.Path(args.input).resolve()
    output_path = pathlib.Path(args.output).resolve()

    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    try:
        image_format = detect_format(output_path)
    except ValueError as err:
        print(str(err), file=sys.stderr)
        return 1

    mermaid_text = input_path.read_text(encoding="utf-8")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.engine in {"kroki", "auto"}:
        try:
            image_bytes = render_with_kroki(
                mermaid_text=mermaid_text,
                image_format=image_format,
                timeout=args.timeout,
                kroki_url=args.kroki_url,
            )
            output_path.write_bytes(image_bytes)
            print(f"Generated (kroki): {output_path}")
            return 0
        except urllib.error.HTTPError as err:
            if args.engine == "kroki":
                print(f"Kroki HTTP error: {err.code} {err.reason}", file=sys.stderr)
                return 1
            print(
                f"Kroki failed ({err.code} {err.reason}), trying Mermaid CLI fallback...",
                file=sys.stderr,
            )
        except urllib.error.URLError as err:
            if args.engine == "kroki":
                print(f"Network error: {err.reason}", file=sys.stderr)
                return 1
            print(
                f"Kroki network error ({err.reason}), trying Mermaid CLI fallback...",
                file=sys.stderr,
            )
        except Exception as err:  # noqa: BLE001
            if args.engine == "kroki":
                print(f"Failed to render via Kroki: {err}", file=sys.stderr)
                return 1
            print(
                f"Kroki unexpected error ({err}), trying Mermaid CLI fallback...",
                file=sys.stderr,
            )

    # mmdc engine (explicit or fallback from auto)
    try:
        render_with_mmdc(input_path=input_path, output_path=output_path, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        print("Mermaid CLI timed out.", file=sys.stderr)
        return 1
    except Exception as err:  # noqa: BLE001
        print(f"Failed to render via Mermaid CLI: {err}", file=sys.stderr)
        return 1

    print(f"Generated (mmdc): {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
