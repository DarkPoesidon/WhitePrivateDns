"""Offline checks for subscriber-side route comparison."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import socket
import struct
import threading
import unittest
from unittest import mock


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "network_probe.py"
SPEC = importlib.util.spec_from_file_location("network_probe", SCRIPT)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class NetworkProbeCandidatesTest(unittest.TestCase):
    def run_main(self, args):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = probe.main(args)
        return code, output.getvalue()

    def test_alternate_doh_route_passes_when_one_candidate_answers(self):
        calls = []

        def fake_doh(url, timeout, token):
            calls.append(url)
            if "blocked.example" in url:
                raise OSError("timed out")
            return "ok", "valid DNS answer"

        with mock.patch.object(probe, "dns_over_https", side_effect=fake_doh):
            code, raw = self.run_main([
                "--doh-url", "https://blocked.example/dns-query?token=secret",
                "--doh-url", "https://edge.example/dns-query",
                "--json",
            ])

        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 2)
        self.assertNotIn("secret", raw)
        results = json.loads(raw)
        self.assertEqual([item["status"] for item in results], ["unreachable", "ok"])
        self.assertEqual(results[0]["target"], "https://blocked.example/dns-query")

    def test_single_target_json_shape_is_preserved_and_errors_redact_tokens(self):
        with mock.patch.object(probe, "dns_over_https", return_value=("ok", "valid DNS answer")):
            code, raw = self.run_main(["--doh-url", "https://edge.example/dns-query", "--json"])
        self.assertEqual(code, 0)
        results = json.loads(raw)
        self.assertEqual(len(results), 1)
        self.assertEqual(set(results[0]), {"path", "target", "status", "latency_ms", "detail"})
        self.assertEqual(results[0]["path"], "doh")

        secret_url = "https://edge.example/dns-query?token=very-secret"
        with mock.patch.object(probe, "dns_over_https", side_effect=ValueError(secret_url)):
            code, raw = self.run_main(["--doh-url", secret_url, "--json"])
        self.assertEqual(code, 1)
        self.assertNotIn("very-secret", raw)
        self.assertEqual(json.loads(raw)[0]["detail"], "ValueError")

        userinfo_url = "https://user:very-secret@edge.example/dns-query"
        code, raw = self.run_main(["--doh-url", userinfo_url, "--json"])
        self.assertEqual(code, 1)
        self.assertNotIn("very-secret", raw)
        self.assertEqual(json.loads(raw)[0]["target"], "https://edge.example/dns-query")

    def test_all_relay_candidates_fail_and_duplicates_are_not_retried(self):
        calls = []

        def fake_relay(ip, port, timeout, sni):
            calls.append((ip, sni))
            raise OSError("connection refused")

        with mock.patch.object(probe, "relay_path", side_effect=fake_relay):
            code, raw = self.run_main([
                "--relay-ip", "192.0.2.1", "--relay-ip", "192.0.2.1",
                "--relay-ip", "192.0.2.2", "--relay-sni", "game.example",
            ])

        self.assertEqual(code, 1)
        self.assertEqual(calls, [("192.0.2.1", "game.example"),
                                 ("192.0.2.2", "game.example")])
        self.assertIn("RELAY candidates that answered: none", raw)

    def test_relay_candidate_requires_probe_status_and_other_paths_still_matter(self):
        results = [
            {"path": "relay", "status": "unreachable"},
            {"path": "relay", "status": "tcp_reachable"},
            {"path": "dns_udp", "status": "service_error"},
        ]
        self.assertTrue(probe.path_passed(results, "relay"))
        self.assertFalse(probe.path_passed(results, "dns_udp"))


class NetworkProbeTransportTest(unittest.TestCase):
    @staticmethod
    def reply(query):
        txid = struct.unpack("!H", query[:2])[0]
        return (struct.pack("!HHHHHH", txid, 0x8180, 1, 1, 0, 0) + query[12:] +
                b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 60, 4) + bytes([203, 0, 113, 5]))

    def test_dns_response_distinguishes_success_from_refusal(self):
        txid, query = probe.dns_query()
        self.assertEqual(struct.unpack("!H", query[:2])[0], txid)
        success = struct.pack("!HHHHHH", txid, 0x8180, 1, 1, 0, 0)
        refused = struct.pack("!HHHHHH", txid, 0x8185, 1, 0, 0, 0)
        self.assertEqual(probe.dns_result(success, txid)[0], "ok")
        self.assertEqual(probe.dns_result(refused, txid)[0], "service_error")
        with self.assertRaises(ValueError):
            probe.dns_result(success, txid ^ 1)

    def test_http_error_is_a_service_failure_not_a_success(self):
        from urllib.error import HTTPError

        result = probe.run_probe("doh", "https://dns.example/dns-query", lambda: (_ for _ in ()).throw(
            HTTPError("https://dns.example/dns-query", 403, "Forbidden", {}, None)))
        self.assertEqual(result["status"], "service_error")
        self.assertIn("403", result["detail"])

    def test_udp_and_tcp_paths_read_real_framed_replies(self):
        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp.bind(("127.0.0.1", 0))
        tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        tcp.bind(("127.0.0.1", 0))
        tcp.listen(1)

        def answer_udp():
            try:
                packet, addr = udp.recvfrom(4096)
                udp.sendto(self.reply(packet), addr)
            finally:
                udp.close()

        def answer_tcp():
            try:
                conn, _ = tcp.accept()
                with conn:
                    size = struct.unpack("!H", probe.read_exact(conn, 2))[0]
                    packet = probe.read_exact(conn, size)
                    reply = self.reply(packet)
                    conn.sendall(struct.pack("!H", len(reply)) + reply)
            finally:
                tcp.close()

        workers = [threading.Thread(target=answer_udp), threading.Thread(target=answer_tcp)]
        for worker in workers:
            worker.start()
        self.assertEqual(probe.dns_over_udp("127.0.0.1", udp.getsockname()[1], 2)[0], "ok")
        self.assertEqual(probe.dns_over_tcp("127.0.0.1", tcp.getsockname()[1], 2)[0], "ok")
        for worker in workers:
            worker.join(timeout=2)
            self.assertFalse(worker.is_alive())


if __name__ == "__main__":
    unittest.main()
