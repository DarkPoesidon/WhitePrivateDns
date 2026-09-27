#!/usr/bin/env python3
"""Measure WhitePrivateDns paths from a subscriber network, without dependencies.

Run this on the user's connection. A timeout proves a path failed from this
network; it does not, by itself, prove why it failed or who blocked it.
"""

import argparse
import json
import os
import secrets
import socket
import ssl
import struct
import sys
import time
from urllib import error, parse, request


def dns_query(name="example.com"):
    labels = name.rstrip(".").encode("ascii").split(b".")
    if not labels or any(not label or len(label) > 63 for label in labels):
        raise ValueError("invalid DNS test name")
    txid = secrets.randbelow(65536)
    question = b"".join(bytes([len(label)]) + label for label in labels) + b"\0"
    packet = struct.pack("!HHHHHH", txid, 0x0100, 1, 0, 0, 0) + question + struct.pack("!HH", 1, 1)
    return txid, packet


def dns_result(payload, txid):
    if len(payload) < 12:
        raise ValueError("short DNS response")
    reply_id, flags, questions, answers, _, _ = struct.unpack("!HHHHHH", payload[:12])
    if reply_id != txid or not flags & 0x8000 or questions != 1:
        raise ValueError("invalid DNS response header")
    rcode = flags & 0xF
    if rcode:
        return "service_error", f"DNS replied with RCODE {rcode}"
    if answers == 0:
        return "service_error", "DNS replied without an answer"
    return "ok", f"DNS answered with {answers} record(s)"


def read_exact(conn, size):
    parts = bytearray()
    while len(parts) < size:
        chunk = conn.recv(size - len(parts))
        if not chunk:
            raise EOFError("connection closed before DNS response completed")
        parts.extend(chunk)
    return bytes(parts)


def dns_over_udp(host, port, timeout):
    txid, packet = dns_query()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as conn:
        conn.settimeout(timeout)
        conn.connect((host, port))
        conn.send(packet)
        return dns_result(conn.recv(4096), txid)


def dns_over_tcp(host, port, timeout, tls=False):
    txid, packet = dns_query()
    with socket.create_connection((host, port), timeout) as plain:
        if tls:
            conn = ssl.create_default_context().wrap_socket(plain, server_hostname=host)
        else:
            conn = plain
        try:
            conn.settimeout(timeout)
            conn.sendall(struct.pack("!H", len(packet)) + packet)
            length = struct.unpack("!H", read_exact(conn, 2))[0]
            if length > 4096:
                raise ValueError("DNS response exceeds probe limit")
            return dns_result(read_exact(conn, length), txid)
        finally:
            if tls:
                conn.close()


def dns_over_https(url, timeout, token):
    parsed = parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("DoH URL must use HTTPS")
    if token:
        params = parse.parse_qsl(parsed.query, keep_blank_values=True)
        params.append(("token", token))
        url = parse.urlunsplit(parsed._replace(query=parse.urlencode(params)))
    txid, packet = dns_query()
    req = request.Request(url, data=packet, headers={
        "Content-Type": "application/dns-message",
        "Accept": "application/dns-message",
        "User-Agent": "WhitePrivateDns-path-probe/1",
    }, method="POST")
    with request.urlopen(req, timeout=timeout) as response:
        if response.headers.get_content_type() != "application/dns-message":
            raise ValueError("DoH endpoint returned non-DNS content (proxy or challenge?)")
        return dns_result(response.read(4097), txid)


def relay_path(host, port, timeout, sni):
    with socket.create_connection((host, port), timeout) as plain:
        if not sni:
            return "tcp_reachable", "TCP port answered; SNI relay was not verified"
        with ssl.create_default_context().wrap_socket(plain, server_hostname=sni) as conn:
            conn.settimeout(timeout)
            return "ok", f"TLS handshake through relay succeeded for {sni}"


def run_probe(name, target, fn):
    start = time.monotonic()
    try:
        status, detail = fn()
    except error.HTTPError as exc:
        status, detail = "service_error", f"HTTP {exc.code} from endpoint"
    except (OSError, ssl.SSLError, EOFError, ValueError) as exc:
        status, detail = "unreachable", f"{type(exc).__name__}: {exc}"
    return {"path": name, "target": target, "status": status,
            "latency_ms": round((time.monotonic() - start) * 1000, 1), "detail": detail}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dns-ip", help="resolver IPv4 for UDP and TCP port 53")
    parser.add_argument("--dns-port", type=int, default=53)
    parser.add_argument("--dot-host", help="DoT hostname (certificate is verified)")
    parser.add_argument("--dot-port", type=int, default=853)
    parser.add_argument("--doh-url", help="full HTTPS DoH URL, usually /dns-query")
    parser.add_argument("--relay-ip", help="IPv4 address advertised for proxied domains")
    parser.add_argument("--relay-port", type=int, default=443)
    parser.add_argument("--relay-sni", help="optional proxied hostname for a complete TLS relay test")
    parser.add_argument("--timeout", type=float, default=3.0)
    parser.add_argument("--json", action="store_true", help="machine-readable output for support")
    args = parser.parse_args(argv)
    if not any((args.dns_ip, args.dot_host, args.doh_url, args.relay_ip)):
        parser.error("supply at least one endpoint")
    if not 0 < args.timeout <= 30:
        parser.error("timeout must be between 0 and 30 seconds")
    for port in (args.dns_port, args.dot_port, args.relay_port):
        if not 1 <= port <= 65535:
            parser.error("ports must be between 1 and 65535")
    if args.relay_sni and not args.relay_ip:
        parser.error("--relay-sni requires --relay-ip")

    results = []
    if args.dns_ip:
        target = f"{args.dns_ip}:{args.dns_port}"
        results.append(run_probe("dns_udp", target, lambda: dns_over_udp(args.dns_ip, args.dns_port, args.timeout)))
        results.append(run_probe("dns_tcp", target, lambda: dns_over_tcp(args.dns_ip, args.dns_port, args.timeout)))
    if args.dot_host:
        results.append(run_probe("dot", f"{args.dot_host}:{args.dot_port}",
                                 lambda: dns_over_tcp(args.dot_host, args.dot_port, args.timeout, tls=True)))
    if args.doh_url:
        parsed = parse.urlsplit(args.doh_url)
        display = parse.urlunsplit(parsed._replace(query="", fragment=""))
        results.append(run_probe("doh", display,
                                 lambda: dns_over_https(args.doh_url, args.timeout,
                                                        os.environ.get("WHITEPRIVATEDNS_DOH_TOKEN", ""))))
    if args.relay_ip:
        results.append(run_probe("relay", f"{args.relay_ip}:{args.relay_port}",
                                 lambda: relay_path(args.relay_ip, args.relay_port,
                                                    args.timeout, args.relay_sni)))

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for item in results:
            print(f"{item['path']:8} {item['status']:14} {item['latency_ms']:7.1f} ms  {item['detail']}")
        print("A failed path alone cannot identify filtering; compare results from several networks.")
    return 0 if all(item["status"] in ("ok", "tcp_reachable") for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
