"""Resolve client IPs through explicit trusted proxies, as in Easy SWU."""
from functools import lru_cache
import ipaddress


def normalize_ip(value):
    if not isinstance(value, str):
        return None
    try:
        address = ipaddress.ip_address(value.split("%")[0])
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return str(address)


@lru_cache(maxsize=16)
def parse_trusted_proxies(value=""):
    networks = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ip, *prefix = part.split("/")
            address = ipaddress.ip_address(ip)
            if len(prefix) > 1 or (
                prefix and (
                    not prefix[0].isdigit()
                    or not 1 <= int(prefix[0]) <= address.max_prefixlen
                )
            ):
                raise ValueError
            networks.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            raise ValueError("TRUST_PROXY_CIDRS requires explicit proxy IPs or nonzero CIDRs") from None
    return tuple(networks)


def get_client_ip(request, cidrs=""):
    peer = normalize_ip(request.client.host if request.client else None)
    if not peer:
        return None
    networks = parse_trusted_proxies(cidrs)
    current = peer
    forwarded = request.headers.get("x-forwarded-for", "")
    if not isinstance(forwarded, str):
        return peer
    for hop in reversed(forwarded.split(",")):
        if not any(ipaddress.ip_address(current) in network for network in networks):
            break
        candidate = normalize_ip(hop.strip())
        if not candidate:
            return peer
        current = candidate
    return current
