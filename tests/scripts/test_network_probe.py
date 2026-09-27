import importlib.util
import pathlib
import socket
import struct
import threading
import unittest


SOURCE = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "network_probe.py"
SPEC = importlib.util.spec_from_file_location("network_probe", SOURCE)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class NetworkProbeTest(unittest.TestCase):
    @staticmethod
    def reply(query):
        txid = struct.unpack("!H", query[:2])[0]
        return (struct.pack("!HHHHHH", txid, 0x8180, 1, 1, 0, 0) + query[12:] +
                b"\xc0\x0c" + struct.pack("!HHIH", 1, 1, 60, 4) + bytes([203, 0, 113, 5]))

    def test_dns_response_distinguishes_success_from_refusal(self):
        txid, query = PROBE.dns_query()
        self.assertEqual(struct.unpack("!H", query[:2])[0], txid)
        success = struct.pack("!HHHHHH", txid, 0x8180, 1, 1, 0, 0)
        refused = struct.pack("!HHHHHH", txid, 0x8185, 1, 0, 0, 0)
        self.assertEqual(PROBE.dns_result(success, txid)[0], "ok")
        self.assertEqual(PROBE.dns_result(refused, txid)[0], "service_error")
        with self.assertRaises(ValueError):
            PROBE.dns_result(success, txid ^ 1)

    def test_http_error_is_a_service_failure_not_a_success(self):
        from urllib.error import HTTPError

        result = PROBE.run_probe("doh", "https://dns.example/dns-query", lambda: (_ for _ in ()).throw(
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
                    size = struct.unpack("!H", PROBE.read_exact(conn, 2))[0]
                    packet = PROBE.read_exact(conn, size)
                    reply = self.reply(packet)
                    conn.sendall(struct.pack("!H", len(reply)) + reply)
            finally:
                tcp.close()

        workers = [threading.Thread(target=answer_udp), threading.Thread(target=answer_tcp)]
        for worker in workers:
            worker.start()
        self.assertEqual(PROBE.dns_over_udp("127.0.0.1", udp.getsockname()[1], 2)[0], "ok")
        self.assertEqual(PROBE.dns_over_tcp("127.0.0.1", tcp.getsockname()[1], 2)[0], "ok")
        for worker in workers:
            worker.join(timeout=2)
            self.assertFalse(worker.is_alive())


if __name__ == "__main__":
    unittest.main()
