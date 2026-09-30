"""Risk-aware routing on a small settlement graph.

Edge cost is distance plus a penalty only when hazard exceeds a threshold.
Safer ridge roads can then outrank a shorter valley road. The penalty is in
kilometre-equivalents so the tradeoff stays explicit.

A production version would replace this graph with an OpenStreetMap network
loaded through OSMnx and searched with the same cost function.
"""

from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush

HAZARD_THRESHOLD = 0.50
# Kilometres added for each unit of hazard above the threshold.
# 100 km keeps the 12 km valley road cheaper at the default storm and lets the
# ridge road win once that valley edge's hazard rises at +30% rainfall.
HAZARD_PENALTY_KM = 100.0


@dataclass(frozen=True)
class RoadEdge:
    id: str
    a: str
    b: str
    distance_km: float
    kind: str  # river, highway, ridge, trail


def edge_hazard(edge: RoadEdge, landslide: dict[str, float], flood: dict[str, float]) -> float:
    """Corridor hazard from the two settlements it connects."""
    ls = max(landslide[edge.a], landslide[edge.b])
    fl = max(flood[edge.a], flood[edge.b])
    if edge.kind == "river":
        return min(1.0, 0.12 + 0.88 * max(fl, 0.72 * ls))
    if edge.kind == "highway":
        return min(1.0, 0.08 + 0.92 * ls)
    if edge.kind == "trail":
        return min(1.0, 0.10 + 0.95 * ls)
    # Ridge roads sit above the gorge, so the same slope probability is discounted.
    return min(1.0, 0.04 + 0.50 * ls)


def risk_cost(distance_km: float, hazard: float) -> float:
    excess = max(0.0, hazard - HAZARD_THRESHOLD)
    return distance_km + HAZARD_PENALTY_KM * excess


def shortest_path(
    edges: list[RoadEdge],
    origin: str,
    destination: str,
    weight,
) -> list[str] | None:
    graph: dict[str, list[tuple[float, str]]] = {}
    for edge in edges:
        w_ab = weight(edge)
        graph.setdefault(edge.a, []).append((w_ab, edge.b))
        graph.setdefault(edge.b, []).append((w_ab, edge.a))

    queue: list[tuple[float, str, list[str]]] = [(0.0, origin, [origin])]
    seen: set[str] = set()
    while queue:
        cost, node, path = heappop(queue)
        if node in seen:
            continue
        seen.add(node)
        if node == destination:
            return path
        for step, nxt in graph.get(node, []):
            if nxt not in seen:
                heappush(queue, (cost + step, nxt, path + [nxt]))
    return None
