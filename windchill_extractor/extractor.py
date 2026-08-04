import argparse
import json
import os
import re
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import DEFAULT_OUTPUT, DEFAULT_PART_ID, HOSTNAME, PASSWORD, USERNAME, VERIFY_SSL

SESSION = requests.Session()
SESSION.auth = (USERNAME, PASSWORD)
SESSION.verify = VERIFY_SSL
BASE_URL = f"http://{HOSTNAME}/Windchill/servlet/odata/ProdMgmt"
CHANGE_BASE_URL = f"http://{HOSTNAME}/Windchill/servlet/odata/v6/ChangeMgmt"


def generated_at() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def require_configuration() -> None:
    missing = [name for name, value in (("WINDCHILL_HOSTNAME", HOSTNAME), ("WINDCHILL_USERNAME", USERNAME), ("WINDCHILL_PASSWORD", PASSWORD)) if not value]
    if missing:
        raise RuntimeError(f"Missing Windchill configuration: {', '.join(missing)}")


def request_json(method: str, url: str, **kwargs: Any) -> Any:
    response = SESSION.request(method, url, timeout=120, **kwargs)
    response.raise_for_status()
    return response.json()


def get_csrf_token() -> str:
    payload = request_json("GET", f"http://{HOSTNAME}/Windchill/servlet/odata/PTC/GetCSRFToken()")
    nonce = payload.get("NonceValue") or payload.get("nonceValue") or payload.get("value")
    if not nonce:
        raise RuntimeError("Windchill CSRF response did not contain NonceValue")
    return str(nonce)


def oid(part_id: str) -> str:
    cleaned = part_id.strip()
    return cleaned if cleaned.startswith("OR:wt.part.WTPart:") else f"OR:wt.part.WTPart:{cleaned}"


def numeric_id(part_oid: str) -> str:
    return part_oid.rsplit(":", 1)[-1]



def odata_quote(value: str) -> str:
    return value.replace("'", "''")


def search_parts(query: str, limit: int = 20) -> list[dict[str, Any]]:
    cleaned = query.strip()
    if not cleaned:
        raise ValueError("A product name or number is required")
    safe = odata_quote(cleaned)
    filters = [
        f"Number eq '{safe}'",
        f"Name eq '{safe}'",
        f"contains(Number,'{safe}')",
        f"contains(Name,'{safe}')",
    ]
    found: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    successful_queries = 0
    for expression in filters:
        if len(found) >= limit:
            break
        try:
            payload = request_json(
                "GET",
                f"{BASE_URL}/Parts",
                params={
                    "$filter": expression,
                    "$top": str(limit),
                    "ptc.search.latestversion": "true",
                },
            )
            successful_queries += 1
        except Exception as exc:
            errors.append(f"{expression}: {exc}")
            continue
        for item in payload.get("value", []):
            if not isinstance(item, dict):
                continue
            item_oid = str(item.get("ID") or "")
            if not item_oid or item_oid in found:
                continue
            display = str(item.get("Version") or item.get("Revision") or "").strip()
            found[item_oid] = {
                "partId": item_oid,
                "numericPartId": numeric_id(item_oid),
                "number": item.get("Number"),
                "name": item.get("Name"),
                "revision": item.get("Revision"),
                "version": display or None,
                "versionId": item.get("VersionID"),
                "state": (item.get("State") or {}).get("Display") if isinstance(item.get("State"), dict) else item.get("State"),
                "view": item.get("View"),
                "latest": bool(item.get("Latest")),
                "objectType": item.get("ObjectType"),
            }
            if len(found) >= limit:
                break
    if successful_queries == 0:
        raise RuntimeError("Windchill product search failed: " + (errors[-1] if errors else "no search query completed"))
    exact = cleaned.casefold()
    results = list(found.values())
    results.sort(
        key=lambda item: (
            0 if str(item.get("number") or "").casefold() == exact else
            1 if str(item.get("name") or "").casefold() == exact else
            2 if str(item.get("number") or "").casefold().startswith(exact) else
            3 if str(item.get("name") or "").casefold().startswith(exact) else 4,
            str(item.get("name") or "").casefold(),
            str(item.get("number") or "").casefold(),
        )
    )
    return results[:limit]

def get_versions(part_id: str) -> list[dict[str, Any]]:
    payload = request_json("GET", f"{BASE_URL}/Parts('{oid(part_id)}')/Versions")
    versions = []
    for item in payload.get("value", []):
        if not isinstance(item, dict):
            continue
        display = str(item.get("Version") or item.get("Revision") or "").strip()
        label_match = re.match(r"^([^\s(]+)", display)
        label = label_match.group(1) if label_match else display
        item_oid = str(item.get("ID") or "")
        if not label or not item_oid:
            continue
        versions.append({
            "label": label,
            "display": display,
            "partId": item_oid,
            "numericPartId": numeric_id(item_oid),
            "revision": item.get("Revision"),
            "latest": bool(item.get("Latest")),
            "name": item.get("Name"),
            "number": item.get("Number"),
            "view": item.get("View"),
        })
    return versions


def get_structure(part_id: str) -> dict[str, Any]:
    nonce = get_csrf_token()
    return request_json(
        "POST",
        f"{BASE_URL}/Parts('{oid(part_id)}')/PTC.ProdMgmt.GetPartStructure",
        headers={"Accept": "application/json", "Content-Type": "application/json", "CSRF_NONCE": nonce},
        params={"$expand": "Components($levels=max)"},
    )


def scalar(value: Any) -> Any:
    return value if isinstance(value, (str, int, float, bool)) else None


def normalize_node(node: dict[str, Any], path: str, sibling_index: int = 0) -> dict[str, Any]:
    part_oid = str(node.get("PartId") or node.get("id") or f"unknown:{path}")
    part_number = str(node.get("PartNumber") or node.get("partNumber") or numeric_id(part_oid))
    name = str(node.get("PartName") or node.get("name") or part_number)
    part_use_id = scalar(node.get("PartUseId"))
    quantity = scalar(node.get("Quantity") or node.get("quantity") or node.get("qty"))
    occurrence_id = str(part_use_id or node.get("PathId") or f"{path}/{part_number}#{sibling_index}")
    attributes: dict[str, Any] = {
        "Item ID": part_number,
        "Part ID": part_oid,
        "Occurrence ID": occurrence_id,
        "Tree Path": path,
        "Source": "windchill",
    }
    optional = {
        "Part Use ID": part_use_id,
        "Path ID": scalar(node.get("PathId")),
        "PV Tree ID": scalar(node.get("PVTreeId")),
        "PV Parent Tree ID": scalar(node.get("PVParentTreeId")),
        "Resolved": scalar(node.get("Resolved")),
        "Has Children": scalar(node.get("HasChildren")),
        "Quantity": quantity,
    }
    attributes.update({key: value for key, value in optional.items() if value is not None})
    raw_children = node.get("Components") or node.get("components") or node.get("children") or []
    counters: dict[str, int] = defaultdict(int)
    children = []
    for child in raw_children if isinstance(raw_children, list) else []:
        if not isinstance(child, dict):
            continue
        child_number = str(child.get("PartNumber") or child.get("partNumber") or child.get("PartId") or "unknown")
        occurrence_index = counters[child_number]
        counters[child_number] += 1
        child_path = f"{path}/{child_number}#{occurrence_index}"
        children.append(normalize_node(child, child_path, occurrence_index))
    return {
        "id": occurrence_id,
        "name": name,
        "quantity": quantity,
        "attributes": attributes,
        "children": children,
    }


def normalize_structure(payload: dict[str, Any], requested_part_id: str, version: dict[str, Any] | None = None) -> dict[str, Any]:
    root_number = str(payload.get("PartNumber") or requested_part_id)
    root = normalize_node(payload, root_number)
    if version:
        root["attributes"]["Revision"] = version["label"]
        root["attributes"]["Version"] = version["display"]
    return {
        "productId": requested_part_id,
        "productName": root["name"],
        "generatedDate": generated_at(),
        "version": version,
        "bom": [root],
        "source": "windchill-api",
    }


def flatten(root: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    queue = deque([(root, None, 0)])
    while queue:
        node, parent_key, level = queue.popleft()
        attrs = node.get("attributes") or {}
        item_id = str(attrs.get("Item ID") or node.get("name") or "")
        path = str(attrs.get("Tree Path") or item_id)
        key = path
        out.append({"key": key, "itemId": item_id, "name": node.get("name"), "parentKey": parent_key, "level": level, "node": node})
        for child in node.get("children") or []:
            queue.append((child, key, level + 1))
    return out


def compare_trees(from_doc: dict[str, Any], to_doc: dict[str, Any]) -> dict[str, Any]:
    from_root = from_doc["bom"][0]
    to_root = to_doc["bom"][0]
    left = flatten(from_root)
    right = flatten(to_root)
    left_by_key = {item["key"]: item for item in left}
    right_by_key = {item["key"]: item for item in right}
    from_map: dict[str, dict[str, Any]] = {}
    to_map: dict[str, dict[str, Any]] = {}
    changes: list[dict[str, Any]] = []
    unmatched_left = set(left_by_key)
    unmatched_right = set(right_by_key)

    for key in sorted(set(left_by_key) & set(right_by_key)):
        a, b = left_by_key[key], right_by_key[key]
        diffs = []
        if a["name"] != b["name"]:
            diffs.append({"field": "name", "from": a["name"], "to": b["name"]})
        aq = (a["node"].get("attributes") or {}).get("Quantity")
        bq = (b["node"].get("attributes") or {}).get("Quantity")
        if aq is not None and bq is not None and aq != bq:
            diffs.append({"field": "quantity", "from": aq, "to": bq})
        status = "changed" if diffs else "unchanged"
        entry = {"status": status, "itemId": a["itemId"], "fromPath": key, "toPath": key, "differences": diffs}
        from_map[a["node"]["id"]] = entry
        to_map[b["node"]["id"]] = entry
        if status == "changed":
            changes.append(entry)
        unmatched_left.discard(key)
        unmatched_right.discard(key)

    left_by_item: dict[str, list[dict[str, Any]]] = defaultdict(list)
    right_by_item: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for key in unmatched_left:
        left_by_item[left_by_key[key]["itemId"]].append(left_by_key[key])
    for key in unmatched_right:
        right_by_item[right_by_key[key]["itemId"]].append(right_by_key[key])

    for item_id in sorted(set(left_by_item) & set(right_by_item)):
        while left_by_item[item_id] and right_by_item[item_id]:
            a = left_by_item[item_id].pop(0)
            b = right_by_item[item_id].pop(0)
            entry = {"status": "moved", "itemId": item_id, "fromPath": a["key"], "toPath": b["key"], "differences": [{"field": "parent", "from": a["parentKey"], "to": b["parentKey"]}]}
            from_map[a["node"]["id"]] = entry
            to_map[b["node"]["id"]] = entry
            changes.append(entry)
            unmatched_left.discard(a["key"])
            unmatched_right.discard(b["key"])

    for key in sorted(unmatched_left):
        item = left_by_key[key]
        entry = {"status": "removed", "itemId": item["itemId"], "fromPath": key, "toPath": None, "differences": []}
        from_map[item["node"]["id"]] = entry
        changes.append(entry)
    for key in sorted(unmatched_right):
        item = right_by_key[key]
        entry = {"status": "added", "itemId": item["itemId"], "fromPath": None, "toPath": key, "differences": []}
        to_map[item["node"]["id"]] = entry
        changes.append(entry)

    summary = {name: 0 for name in ("added", "removed", "moved", "changed", "unchanged")}
    for value in from_map.values():
        if value["status"] in ("removed", "moved", "changed", "unchanged"):
            summary[value["status"]] += 1
    summary["added"] = sum(1 for value in to_map.values() if value["status"] == "added")
    return {"summary": summary, "fromTree": from_doc, "toTree": to_doc, "fromMap": from_map, "toMap": to_map, "changes": changes, "generatedAt": generated_at()}



def flatten_normalized_nodes(root: dict[str, Any]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    queue = deque([(root, [])])
    while queue:
        node, ancestors = queue.popleft()
        attrs = node.get("attributes") or {}
        entry = {
            "nodeId": str(node.get("id") or ""),
            "partId": str(attrs.get("Part ID") or ""),
            "partNumber": str(attrs.get("Item ID") or ""),
            "partName": str(node.get("name") or ""),
            "ancestorNodeIds": ancestors,
        }
        nodes.append(entry)
        next_ancestors = [*ancestors, entry["nodeId"]]
        for child in node.get("children") or []:
            if isinstance(child, dict):
                queue.append((child, next_ancestors))
    return nodes


def clean_description(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", text).strip() or None


def notice_oid_from_resource(resource_id: Any) -> str | None:
    if not isinstance(resource_id, str):
        return None
    match = re.search(r"ChangeNotices\('([^']+)'\)", resource_id)
    return match.group(1) if match else None


def query_part_changes(part_oid: str) -> list[dict[str, Any]]:
    payload = request_json("GET", f"{CHANGE_BASE_URL}/Changeables('{part_oid}')/AffectedByObjects")
    return [item for item in payload.get("value", []) if isinstance(item, dict)]


def change_impact(part_id: str) -> dict[str, Any]:
    structure_doc = normalize_structure(get_structure(part_id), part_id)
    root = structure_doc["bom"][0]
    nodes = flatten_normalized_nodes(root)
    by_part_oid: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in nodes:
        if node["partId"].startswith("OR:wt.part.WTPart:"):
            by_part_oid[node["partId"]].append(node)

    task_hits: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    workers = min(6, max(1, len(by_part_oid)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(query_part_changes, part_oid): part_oid for part_oid in by_part_oid}
        for future in as_completed(futures):
            part_oid = futures[future]
            try:
                tasks = future.result()
            except Exception as exc:
                warnings.append(f"Change lookup failed for {part_oid}: {exc}")
                continue
            for task in tasks:
                if str(task.get("ObjectType") or "").lower() != "change task":
                    continue
                task_oid = str(task.get("ID") or "")
                if not task_oid:
                    continue
                hit = task_hits.setdefault(task_oid, {"task": task, "partOids": set()})
                hit["partOids"].add(part_oid)

    notices: dict[str, dict[str, Any]] = {}
    direct_node_ids: set[str] = set()
    indirect_node_ids: set[str] = set()
    affected_parts_total: set[str] = set()

    for task_oid, hit in task_hits.items():
        task = hit["task"]
        affected_links = request_json(
            "GET",
            f"{CHANGE_BASE_URL}/ChangeTasks('{task_oid}')/CNAffectLinks",
            params={"$expand": "AffectedObjects"},
        ).get("value", [])
        relevant_parts: list[dict[str, Any]] = []
        for link in affected_links if isinstance(affected_links, list) else []:
            if not isinstance(link, dict):
                continue
            for affected in link.get("AffectedObjects") or []:
                if not isinstance(affected, dict):
                    continue
                affected_oid = str(affected.get("ID") or "")
                if affected_oid not in hit["partOids"]:
                    continue
                matched_nodes = by_part_oid.get(affected_oid, [])
                for node in matched_nodes:
                    direct_node_ids.add(node["nodeId"])
                    indirect_node_ids.update(node["ancestorNodeIds"])
                affected_parts_total.add(str(affected.get("Number") or affected_oid))
                relevant_parts.append({
                    "partId": affected_oid,
                    "partNumber": affected.get("Number"),
                    "partName": affected.get("Name"),
                    "revision": affected.get("Revision"),
                    "version": affected.get("Version"),
                    "state": (affected.get("State") or {}).get("Display") if isinstance(affected.get("State"), dict) else affected.get("State"),
                    "changeIntent": (link.get("ChangeIntent") or {}).get("Display") if isinstance(link.get("ChangeIntent"), dict) else link.get("ChangeIntent"),
                    "finishedDisposition": (link.get("FinishedDisposition") or {}).get("Display") if isinstance(link.get("FinishedDisposition"), dict) else link.get("FinishedDisposition"),
                    "inventoryDisposition": (link.get("InventoryDisposition") or {}).get("Display") if isinstance(link.get("InventoryDisposition"), dict) else link.get("InventoryDisposition"),
                    "onOrderDisposition": (link.get("OnOrderDisposition") or {}).get("Display") if isinstance(link.get("OnOrderDisposition"), dict) else link.get("OnOrderDisposition"),
                    "matchedNodeIds": [node["nodeId"] for node in matched_nodes],
                    "matchMethod": "part-oid",
                })
        if not relevant_parts:
            continue
        reference = task.get("ChangeNoticeReference") or {}
        notice_oid = notice_oid_from_resource(reference.get("ResourceID") if isinstance(reference, dict) else None)
        notice_key = notice_oid or str(reference.get("Identity") if isinstance(reference, dict) else task_oid)
        if notice_key not in notices:
            detail: dict[str, Any] = {}
            if notice_oid:
                try:
                    detail = request_json("GET", f"{CHANGE_BASE_URL}/ChangeNotices('{notice_oid}')")
                except Exception as exc:
                    warnings.append(f"Change Notice lookup failed for {notice_oid}: {exc}")
            notices[notice_key] = {
                "id": notice_oid,
                "number": detail.get("Number") or (str(reference.get("Identity") or "").replace("Change Notice - ", "") if isinstance(reference, dict) else None),
                "name": detail.get("Name") or (reference.get("Name") if isinstance(reference, dict) else None),
                "description": clean_description(detail.get("Description")),
                "descriptionSummary": clean_description(detail.get("DescriptionSummary")),
                "state": (detail.get("State") or {}).get("Display") if isinstance(detail.get("State"), dict) else detail.get("State"),
                "createdOn": detail.get("CreatedOn"),
                "lastModified": detail.get("LastModified"),
                "resolutionDate": detail.get("ResolutionDate"),
                "tasks": [],
                "affectedParts": [],
            }
        notice = notices[notice_key]
        notice["tasks"].append({
            "id": task_oid,
            "number": task.get("Number"),
            "name": task.get("Name"),
            "description": clean_description(task.get("Description")),
            "state": (task.get("State") or {}).get("Display") if isinstance(task.get("State"), dict) else task.get("State"),
            "resolutionDate": task.get("ResolutionDate"),
        })
        notice["affectedParts"].extend(relevant_parts)

    indirect_node_ids.difference_update(direct_node_ids)
    impact_map: dict[str, dict[str, Any]] = {node_id: {"impact": "indirect"} for node_id in indirect_node_ids}
    for notice in notices.values():
        for affected in notice["affectedParts"]:
            for node_id in affected["matchedNodeIds"]:
                entry = impact_map.setdefault(node_id, {"impact": "direct", "notices": []})
                entry["impact"] = "direct"
                entry.setdefault("notices", []).append({
                    "number": notice.get("number"),
                    "name": notice.get("name"),
                    "state": notice.get("state"),
                    "affectedVersion": affected.get("version"),
                    "changeIntent": affected.get("changeIntent"),
                })

    return {
        "product": {
            "partId": root.get("attributes", {}).get("Part ID"),
            "partNumber": root.get("attributes", {}).get("Item ID"),
            "partName": root.get("name"),
        },
        "changeNotices": list(notices.values()),
        "impactMap": impact_map,
        "summary": {
            "changeNotices": len(notices),
            "affectedParts": len(affected_parts_total),
            "affectedOccurrences": len(direct_node_ids),
            "impactedAssemblies": len(indirect_node_ids),
        },
        "warnings": warnings,
        "generatedAt": generated_at(),
        "scanMode": "current-structure",
    }

def select_version(versions: list[dict[str, Any]], label: str) -> dict[str, Any]:
    for version in versions:
        if version["label"].lower() == label.lower() or version["display"].lower() == label.lower():
            return version
    raise ValueError(f"Version '{label}' was not found")


def run(args: argparse.Namespace) -> dict[str, Any]:
    require_configuration()
    if args.operation == "search":
        results = search_parts(args.query or args.part_id)
        return {"query": args.query or args.part_id, "results": results, "generatedAt": generated_at(), "source": "windchill-api"}
    if args.operation == "change-impact":
        return change_impact(args.part_id)
    if args.operation == "versions":
        versions = get_versions(args.part_id)
        return {"productId": args.part_id, "versions": versions, "generatedAt": generated_at(), "source": "windchill-api"}
    if args.operation == "structure":
        version = None
        selected_id = args.part_id
        if args.version:
            version = select_version(get_versions(args.part_id), args.version)
            selected_id = version["numericPartId"]
        return normalize_structure(get_structure(selected_id), args.part_id, version)
    if args.operation == "compare":
        if not args.from_version or not args.to_version:
            raise ValueError("--from-version and --to-version are required for compare")
        versions = get_versions(args.part_id)
        from_version = select_version(versions, args.from_version)
        to_version = select_version(versions, args.to_version)
        if from_version["label"] == to_version["label"]:
            raise ValueError("From and To versions must be different")
        from_doc = normalize_structure(get_structure(from_version["numericPartId"]), args.part_id, from_version)
        to_doc = normalize_structure(get_structure(to_version["numericPartId"]), args.part_id, to_version)
        result = compare_trees(from_doc, to_doc)
        result.update({"productId": args.part_id, "fromVersion": from_version, "toVersion": to_version})
        return result
    return normalize_structure(get_structure(args.part_id), args.part_id)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Windchill BOM and revision extractor")
    parser.add_argument("--operation", choices=("extract", "versions", "structure", "compare", "change-impact", "search"), default="extract")
    parser.add_argument("--part-id", default=DEFAULT_PART_ID)
    parser.add_argument("--query")
    parser.add_argument("--version")
    parser.add_argument("--from-version")
    parser.add_argument("--to-version")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    output = run(arguments)
    Path(arguments.output).write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Extraction saved to {arguments.output}")
