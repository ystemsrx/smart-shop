import sys
from pathlib import Path
from types import SimpleNamespace
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from client_ip import get_client_ip, normalize_ip, parse_trusted_proxies


class ClientIpTests(unittest.TestCase):
    def request(self, peer, forwarded):
        return SimpleNamespace(client=SimpleNamespace(host=peer), headers={"x-forwarded-for": forwarded, "x-real-ip": "192.0.2.99"})

    def test_direct_peers_ignore_forged_forwarded_headers(self):
        self.assertEqual(get_client_ip(self.request("198.51.100.20", "192.0.2.1")), "198.51.100.20")
        self.assertEqual(get_client_ip(self.request("198.51.100.20", "192.0.2.1"), "10.42.0.0/16"), "198.51.100.20")

    def test_trusted_chain_stops_at_first_untrusted_hop(self):
        self.assertEqual(get_client_ip(self.request("10.42.1.5", "192.0.2.1, 198.51.100.20, 127.0.0.1"), "10.42.0.0/16,127.0.0.1/32"), "198.51.100.20")
        self.assertEqual(get_client_ip(self.request("10.42.1.5", "garbage"), "10.42.0.0/16"), "10.42.1.5")

    def test_normalizes_equivalent_addresses(self):
        self.assertEqual(normalize_ip("::ffff:198.51.100.20"), "198.51.100.20")
        self.assertEqual(normalize_ip("2001:0db8:0:0:0:0:0:1"), "2001:db8::1")
        self.assertIsNone(normalize_ip("198.51.100.20,192.0.2.99"))

    def test_rejects_blanket_and_hop_count_proxy_trust(self):
        for value in ["true", "1", "0.0.0.0/0", "::/0", "127.0.0.1/33", "10.42.0.1/8/2"]:
            with self.assertRaises(ValueError):
                parse_trusted_proxies(value)
