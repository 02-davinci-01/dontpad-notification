import os
import time
import difflib
import requests

DONTPAD_API = "https://api.dontpad.com"
NTFY_URL = "https://ntfy.sh"

DONTPAD_PATH = os.environ.get("DONTPAD_PATH", "/goldFish")
NTFY_TOPIC = os.environ.get("NTFY_TOPIC", "dontpadgoldFish")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))


def fetch_body(last_modified=0):
    path = DONTPAD_PATH.rstrip("/")
    url = f"{DONTPAD_API}{path}.body.json"
    resp = requests.get(url, params={"lastModified": last_modified}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def compute_diff(old_text, new_text):
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)
    diff = difflib.unified_diff(old_lines, new_lines, fromfile="before", tofile="after")
    return "".join(diff)


def send_notification(diff_text):
    url = f"{NTFY_URL}/{NTFY_TOPIC}"
    title = f"dontpad{DONTPAD_PATH} changed"

    if len(diff_text) > 4000:
        diff_text = diff_text[:3950] + "\n... (truncated)"

    requests.post(
        url,
        data=diff_text.encode("utf-8"),
        headers={
            "Title": title,
            "Tags": "memo,warning",
        },
        timeout=10,
    )


def main():
    print(f"Monitoring dontpad path: {DONTPAD_PATH}")
    print(f"Sending notifications to ntfy topic: {NTFY_TOPIC}")
    print(f"Poll interval: {POLL_INTERVAL}s")

    result = fetch_body(0)
    current_text = result.get("body", "")
    last_modified = result.get("lastModified", 0)
    print(f"Initial fetch done. lastModified={last_modified}, length={len(current_text)}")

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            result = fetch_body(last_modified)
            if result.get("changed"):
                new_text = result.get("body", "")
                new_modified = result.get("lastModified", last_modified)

                diff = compute_diff(current_text, new_text)
                if diff:
                    print(f"Change detected at {new_modified}")
                    print(diff)
                    send_notification(diff)

                current_text = new_text
                last_modified = new_modified
        except requests.RequestException as e:
            print(f"Request error: {e}")
        except Exception as e:
            print(f"Unexpected error: {e}")


if __name__ == "__main__":
    main()
