import concurrent.futures
import hashlib
import http.client
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

PROOF = "/api/v1/proofs"
VERIFY = "/api/v1/verifications"
ID = "00000000-0000-4000-8000-000000000001"
STAMP = "2026-10-25T12:00:00Z"
HASH = hashlib.sha256(b"").hexdigest()

RECEIPT = {
    "version": "1",
    "hashAlgorithm": "SHA256",
    "documentHash": HASH,
    "timestampAt": STAMP,
    # Synthetic bytes: this fixture is not an RFC 3161 token.
    "timestampTokenBase64": "AQID",
}
PROOF_BODY = {
    "id": ID,
    "hashAlgorithm": "SHA256",
    "documentHash": HASH,
    "timestampAt": STAMP,
    "timestampTokenBase64": "AQID",
    "createdAt": STAMP,
}
SECURITY = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
}

records = []
condition = threading.Condition()
release = threading.Event()


def request(host, path, method="GET", body=None, headers=None):
    connection = http.client.HTTPConnection(host, 8080, timeout=10)
    values = {"Host": "proof.test", **(headers or {})}
    encoded = None if body is None else json.dumps(body).encode()
    if encoded is not None:
        values["Content-Type"] = "application/json"
    try:
        connection.request(method, path, encoded, values)
        response = connection.getresponse()
        return (
            response.status,
            {key.lower(): value for key, value in response.getheaders()},
            response.read(),
        )
    finally:
        connection.close()


class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, body, headers=None):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def handle_request(self):
        parsed = urlsplit(self.path)

        if parsed.path == "/__reset":
            with condition:
                records.clear()
                release.clear()
            return self.respond(200, {})

        if parsed.path == "/__release":
            release.set()
            return self.respond(200, {})

        if parsed.path == "/__state":
            with condition:
                snapshot = list(records)
            return self.respond(200, snapshot)

        if parsed.path == "/__wait":
            count = int(parse_qs(parsed.query)["count"][0])
            with condition:
                ready = condition.wait_for(
                    lambda: len(records) >= count, timeout=5
                )
            return self.respond(200 if ready else 504, {})

        if parsed.path == "/__probe":
            # Originates from the untrusted backend container, not Caddy.
            status, _, _ = request(
                "frontend", PROOF, "POST", {},
                {"X-Forwarded-For": "198.51.100.99"},
            )
            return self.respond(200, {"status": status})

        size = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(size)
        body = json.loads(raw) if raw else {}

        with condition:
            records.append({
                "method": self.command,
                "path": self.path,
                "headers": dict(self.headers),
                "body": body,
            })
            condition.notify_all()

        if self.headers.get("X-Test-Hold") == "yes":
            if not release.wait(timeout=20):
                return self.respond(504, {"detail": "Test hold timed out"})

        if self.headers.get("X-Test-Error") == "yes":
            return self.respond(502, {"detail": "Controlled upstream failure"})

        if parsed.path.endswith("/receipt"):
            return self.respond(200, RECEIPT, {
                "Content-Disposition":
                    f'attachment; filename="proof3161-{ID}.proof.json"'
            })

        normalized_path = "/".join(
            segment.split(";", 1)[0]
            for segment in parsed.path.rstrip("/").split("/")
        )
        if self.command == "POST" and normalized_path == VERIFY:
            return self.respond(200, {
                "status": "VALID",
                "reason": "VERIFIED",
                "timestampAt": STAMP,
            })

        if self.command == "POST":
            proof = {
                **PROOF_BODY,
                "documentHash": body.get("documentHash", HASH),
            }
            return self.respond(201, proof, {
                "Location": f"https://proof.test{PROOF}/{ID}"
            })

        return self.respond(200, PROOF_BODY)


def control(path):
    status, _, body = request("backend", path)
    assert status == 200, (path, status)
    return json.loads(body)


def api(path, ip="198.51.100.10", method="POST", extra=None):
    body = {"documentHash": HASH}
    if path == VERIFY:
        body["portableProof"] = RECEIPT
    return request(
        "frontend", path, method,
        body if method == "POST" else None,
        {"X-Forwarded-For": ip, **(extra or {})},
    )


def check_headers(response):
    _, headers, _ = response
    for name, expected in SECURITY.items():
        assert headers.get(name) == expected, (name, headers)


def expect(response, status):
    assert response[0] == status, (response[0], status, response[2])
    check_headers(response)


def functional():
    for path in ("/", "/index.html", "/some-spa-path"):
        response = request("127.0.0.1", path)
        expect(response, 200)
        assert response[1].get("cache-control") == "no-cache"

    expect(request("127.0.0.1", "/actuator/health"), 404)

    response = request(
        "127.0.0.1", PROOF, "POST", {"documentHash": HASH},
        {
            "X-Forwarded-For": "203.0.113.250",
            "X-Forwarded-Proto": "http",
            "X-Forwarded-Host": "attacker.invalid",
            "X-Forwarded-Port": "81",
            "Forwarded": "for=203.0.113.250;proto=http;host=attacker.invalid",
        },
    )
    expect(response, 201)

    recorded = control("/__state")[-1]
    headers = {key.lower(): value for key, value in recorded["headers"].items()}
    assert recorded["path"] == PROOF
    assert headers.get("x-forwarded-for") == "127.0.0.1", (
        f"Unexpected X-Forwarded-For: {headers.get('x-forwarded-for')!r}"
    )
    assert headers["x-forwarded-proto"] == "https"
    assert headers["x-forwarded-host"] == "proof.test"
    assert headers["x-forwarded-port"] == "443"
    assert "forwarded" not in headers

    response = request(
        "127.0.0.1", VERIFY, "POST",
        {"documentHash": HASH, "portableProof": RECEIPT},
    )
    expect(response, 200)
    assert json.loads(response[2])["status"] == "VALID"

    response = request("127.0.0.1", f"{PROOF}/{ID}/receipt")
    expect(response, 200)
    assert response[1]["content-type"] == "application/json"
    assert json.loads(response[2]) == RECEIPT
    assert response[1]["content-disposition"] == (
        f'attachment; filename="proof3161-{ID}.proof.json"'
    )

    expect(api(VERIFY, extra={"X-Test-Error": "yes"}), 502)
    assert control("/__probe")["status"] == 403


def rate(path, aggregate):
    expected = 201 if path == PROOF else 200
    responses = []

    # Sequential completed requests isolate rate limiting from concurrency.
    for index in range(30 if aggregate else 8):
        ip = f"198.51.100.{index + 1}" if aggregate else "198.51.100.100"
        variants = (
            path,
            path + "?probe=1",
            path.replace("/v1/", "/v1;x=1/") + ";y=2",
            path + "/",
        )
        response = api(variants[index % len(variants)], ip)
        check_headers(response)
        assert response[0] in (expected, 429), response
        responses.append(response)

    assert any(item[0] == 429 for item in responses), (
        "No rate rejection observed; inspect configuration and test duration"
    )
    accepted = sum(item[0] == expected for item in responses)
    assert len(control("/__state")) == accepted

    # Unrelated requests must remain available after exhausting POST budgets.
    for _ in range(12):
        expect(api(f"{PROOF}/{ID}", method="GET"), 200)
        expect(api(f"{PROOF}/{ID}/receipt", method="GET"), 200)
        expect(api(path, method="GET"), 200)

    other = VERIFY if path == PROOF else PROOF
    expect(api(other), 200 if other == VERIFY else 201)


def concurrency(path):
    per_client = 1 if path == PROOF else 2
    expected = 201 if path == PROOF else 200
    futures = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        try:
            for _ in range(per_client):
                futures.append(executor.submit(
                    api, path, "198.51.100.10", "POST",
                    {"X-Test-Hold": "yes"},
                ))
            control(f"/__wait?count={per_client}")

            before = len(control("/__state"))
            started = time.monotonic()
            expect(api(path, "198.51.100.10"), 503)
            assert time.monotonic() - started < 5
            assert len(control("/__state")) == before

            for _ in range(per_client):
                futures.append(executor.submit(
                    api, path, "198.51.100.11", "POST",
                    {"X-Test-Hold": "yes"},
                ))
            control(f"/__wait?count={2 * per_client}")

            before = len(control("/__state"))
            expect(api(path, "198.51.100.12"), 503)
            assert len(control("/__state")) == before

            other = VERIFY if path == PROOF else PROOF
            expect(api(other), 200 if other == VERIFY else 201)
            expect(api(f"{PROOF}/{ID}", method="GET"), 200)
            expect(api(f"{PROOF}/{ID}/receipt", method="GET"), 200)
        finally:
            control("/__release")

        for future in futures:
            expect(future.result(timeout=10), expected)

    expect(api(path, "198.51.100.13"), expected)


if __name__ == "__main__":
    mode = sys.argv[1]

    if mode == "server":
        ThreadingHTTPServer(("0.0.0.0", 8080), MockHandler).serve_forever()
    else:
        control("/__reset")
        if mode == "functional":
            functional()
        else:
            kind, operation = mode.split("-")
            path = PROOF if operation == "proof" else VERIFY
            if kind == "concurrency":
                concurrency(path)
            else:
                rate(path, aggregate=(kind == "aggregate"))
        print(f"PASS: {mode}")