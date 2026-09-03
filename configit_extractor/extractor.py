import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests

from config import API_KEY, BASE_URL, PACKAGE_PATH, VERIFY

HEADERS = {
    "Authorization": f"ApiKey {API_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def generate_date() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _platform_origin() -> str:
    parsed = urlsplit(BASE_URL)
    if not parsed.scheme or not parsed.netloc:
        raise RuntimeError(f"Invalid Configit BASE_URL: {BASE_URL}")
    return f"{parsed.scheme}://{parsed.netloc}"


def _request_json(method: str, url: str, **kwargs: Any) -> Any:
    if not API_KEY:
        raise RuntimeError("CONFIGIT_API_KEY is not set.")
    response = requests.request(
        method,
        url,
        headers=HEADERS,
        verify=VERIFY,
        timeout=120,
        **kwargs,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Configit request failed: {method} {url} "
            f"returned {response.status_code}: {response.text}"
        )
    try:
        return response.json()
    except ValueError as error:
        raise RuntimeError(f"Configit returned invalid JSON for {method} {url}") from error


def resolve_latest_package_path(package_path: str) -> dict[str, Any]:
    requested_path = package_path.strip()
    if not requested_path:
        raise ValueError("Configit package path is required.")

    if "~" in requested_path:
        logical_path, version_id = requested_path.rsplit("~", 1)
        if not logical_path or not version_id:
            raise ValueError(f"Invalid resolved Configit package path: {requested_path}")
        return {
            "requestedPackagePath": requested_path,
            "logicalPackagePath": logical_path,
            "resolvedPackagePath": requested_path,
            "versionId": version_id,
            "state": None,
            "publishedAt": None,
            "sourceCreatedAt": None,
            "visibility": None,
            "withSource": None,
            "resolutionMode": "already-resolved",
        }

    payload = _request_json(
        "GET",
        f"{_platform_origin()}/packages/v1/history",
        params={
            "includeHidden": "true",
            "includeNotPublished": "true",
            "packagePath": requested_path,
        },
    )
    if not isinstance(payload, dict):
        raise RuntimeError("Configit package history returned an unexpected response.")

    latest = payload.get("latestVersion")
    if not isinstance(latest, dict):
        raise RuntimeError(f"No latest version was returned for package: {requested_path}")

    version_id = str(latest.get("id") or "").strip()
    if not version_id:
        raise RuntimeError(f"Latest package version has no ID: {requested_path}")

    logical_path = str(payload.get("packagePath") or requested_path).strip()
    lifecycle = latest.get("lifecycle") if isinstance(latest.get("lifecycle"), dict) else {}
    return {
        "requestedPackagePath": requested_path,
        "logicalPackagePath": logical_path,
        "resolvedPackagePath": f"{logical_path}~{version_id}",
        "versionId": version_id,
        "state": latest.get("state"),
        "openedAt": lifecycle.get("openedAt"),
        "publishingStartedAt": lifecycle.get("publishingStartedAt"),
        "publishedAt": latest.get("publishedAt") or lifecycle.get("publishedAt"),
        "sourceCreatedAt": latest.get("sourceCreatedAt"),
        "visibility": latest.get("visibility"),
        "withSource": latest.get("withSource"),
        "resolutionMode": "latest-version",
    }


def get_package_products(resolved_package_path: str, page_size: int = 100) -> dict[str, Any]:
    products: list[dict[str, Any]] = []
    offset = 0
    reported_total: int | None = None
    language: str | None = None

    while True:
        payload = _request_json(
            "GET",
            f"{_platform_origin()}/packages/v1/products",
            params={
                "limit": page_size,
                "offset": offset,
                "packagePath": resolved_package_path,
            },
        )
        if not isinstance(payload, dict):
            raise RuntimeError("Configit products endpoint returned an unexpected response.")

        page = payload.get("products")
        if not isinstance(page, list):
            raise RuntimeError("Configit products response does not contain a products list.")

        products.extend(item for item in page if isinstance(item, dict))
        if reported_total is None:
            try:
                reported_total = int(payload.get("total"))
            except (TypeError, ValueError):
                reported_total = None
            language = payload.get("language")

        offset += len(page)
        if not page or (reported_total is not None and offset >= reported_total) or len(page) < page_size:
            break

    return {
        "packagePath": resolved_package_path,
        "products": products,
        "total": reported_total if reported_total is not None else len(products),
        "language": language,
    }


def resolve_product_id(
    product_payload: dict[str, Any],
    explicit_product_id: str | None = None,
) -> dict[str, Any]:
    products = product_payload.get("products")
    if not isinstance(products, list):
        raise RuntimeError("Product payload is missing products.")

    if explicit_product_id:
        exact = [
            product for product in products
            if str(product.get("id") or "").casefold() == explicit_product_id.strip().casefold()
        ]
        if len(exact) != 1:
            raise RuntimeError(
                f"Product ID '{explicit_product_id}' was not found uniquely in the resolved package."
            )
        selected = exact[0]
        method = "explicit-product-id"
    else:
        configurable = [
            product for product in products
            if isinstance(product, dict)
            and isinstance(product.get("capabilities"), dict)
            and product["capabilities"].get("configuration") is True
        ]
        if not configurable:
            raise RuntimeError("No configuration-capable product was found in the resolved package.")
        if len(configurable) > 1:
            ids = ", ".join(str(product.get("id") or "") for product in configurable)
            raise RuntimeError(
                "Multiple configuration-capable products were found. "
                f"Specify --product-id. Candidates: {ids}"
            )
        selected = configurable[0]
        method = "single-configuration-capable-product"

    configurable_count = sum(
        1 for product in products
        if isinstance(product.get("capabilities"), dict)
        and product["capabilities"].get("configuration") is True
    )
    return {
        "totalProducts": product_payload.get("total", len(products)),
        "retrievedProducts": len(products),
        "configurableProductCount": configurable_count,
        "selectedProductId": selected.get("id"),
        "selectedProductName": selected.get("name"),
        "selectedProductDescription": selected.get("description"),
        "selectedProductCapabilities": selected.get("capabilities", {}),
        "selectionMethod": method,
    }


def _pick_first(value: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if isinstance(value, dict) and key in value:
            return value[key]
    return None


def _extract_quantity(node: dict[str, Any]) -> Any:
    for key in ("quantity", "qty", "amount", "count"):
        if key in node and node[key] is not None:
            value = node[key]
            if isinstance(value, dict) and "value" in value:
                unit = value.get("unit")
                return f"{value['value']} {unit}" if unit else value["value"]
            return value
    return None


def _extract_children(node: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("children", "nodes", "items", "bom", "childNodes", "subNodes", "bomItems"):
        value = node.get(key)
        if isinstance(value, list):
            return value

    wrappers = node.get("boms")
    if isinstance(wrappers, list):
        flattened: list[dict[str, Any]] = []
        for wrapper in wrappers:
            if not isinstance(wrapper, dict):
                continue
            items = wrapper.get("bomItems")
            if isinstance(items, list) and items:
                flattened.extend(items)
                continue
            nested = wrapper.get("boms")
            if isinstance(nested, list) and nested:
                flattened.extend(nested)
        if flattened:
            return flattened
    return []


def _is_wrapper_node(node: Any) -> bool:
    if not isinstance(node, dict):
        return False
    has_label = any(node.get(key) for key in ("productId", "bomItemId", "name", "id", "itemId"))
    has_children = any(isinstance(node.get(key), list) and node.get(key) for key in ("boms", "bomItems"))
    return not has_label and has_children


def normalize_nodes(node: Any, fallback_id: str) -> list[dict[str, Any]]:
    if _is_wrapper_node(node):
        result: list[dict[str, Any]] = []
        for child in _extract_children(node):
            result.extend(normalize_nodes(child, f"{fallback_id}-child"))
        return result
    return [normalize_node(node, fallback_id)]


def normalize_node(node: Any, fallback_id: str) -> dict[str, Any]:
    if not isinstance(node, dict):
        return {"id": fallback_id, "name": fallback_id, "quantity": None, "attributes": {}, "children": []}

    node_id = _pick_first(node, ["productId", "bomItemId", "nodeId", "id", "itemId"])
    name = _pick_first(node, ["productId", "name", "bomItemId", "nodeId", "id", "itemId"])
    quantity = _extract_quantity(node)
    attributes: dict[str, Any] = {}
    if quantity is not None:
        attributes["Quantity"] = quantity

    children: list[dict[str, Any]] = []
    for child in _extract_children(node):
        children.extend(normalize_nodes(child, f"{fallback_id}-child"))

    return {
        "id": str(node_id or fallback_id),
        "name": str(name or fallback_id),
        "quantity": quantity,
        "attributes": attributes,
        "children": children,
    }


def normalize_solve_response(
    payload: Any,
    product_id: str,
    package_path: str,
    generated_date: str,
) -> dict[str, Any]:
    top_level_nodes: list[dict[str, Any]] = []
    if isinstance(payload, list):
        top_level_nodes = [normalize_node(node, f"node-{index}") for index, node in enumerate(payload)]
    elif isinstance(payload, dict):
        root = payload.get("root") if isinstance(payload.get("root"), dict) else None
        if root:
            top_level_nodes = [normalize_node(root, "root")]
        else:
            for key in ("nodes", "children", "items", "bom"):
                value = payload.get(key)
                if isinstance(value, list):
                    top_level_nodes = [
                        normalized
                        for index, node in enumerate(value)
                        for normalized in normalize_nodes(node, f"{key}-{index}")
                    ]
                    break
                if isinstance(value, dict):
                    top_level_nodes = normalize_nodes(value, key)
                    break
        if not top_level_nodes and isinstance(payload.get("result"), (dict, list)):
            return normalize_solve_response(payload["result"], product_id, package_path, generated_date)

    return {
        "productId": product_id,
        "packagePath": package_path,
        "generatedDate": generated_date,
        "bom": top_level_nodes,
    }


def solve_bom(product_id: str, resolved_package_path: str, generated_date: str) -> Any:
    return _request_json(
        "POST",
        f"{BASE_URL.rstrip('/')}/solve",
        params={"packagePath": resolved_package_path},
        json={
            "productId": product_id,
            "date": generated_date,
            "nodes": [{"nodeId": "ROOT"}],
        },
    )


def save_extraction(data: dict[str, Any], output_file: str) -> None:
    path = Path(output_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Configit BOM extractor with latest-package and product auto-resolution"
    )
    parser.add_argument(
        "--package-path",
        default=PACKAGE_PATH,
        help="Logical package path such as usb, or an already resolved path containing ~<version-id>",
    )
    parser.add_argument(
        "--product-id",
        default=None,
        help="Optional exact product ID. Required only when the package has multiple configurable products.",
    )
    parser.add_argument("--date", default=None, help="Optional solve date")
    parser.add_argument("--output", default="configit_extraction.json")
    parser.add_argument(
        "--resolve-only",
        action="store_true",
        help="Resolve latest package and root product without calling BOM Solve",
    )
    return parser.parse_args()


def run_from_cli() -> None:
    args = parse_args()
    print(f"Resolving Configit package: {args.package_path}")
    package_resolution = resolve_latest_package_path(args.package_path)
    resolved_path = package_resolution["resolvedPackagePath"]
    print(f"Resolved package: {resolved_path}")

    product_payload = get_package_products(resolved_path)
    product_resolution = resolve_product_id(product_payload, args.product_id)
    selected_product_id = str(product_resolution["selectedProductId"])
    print(f"Resolved product: {selected_product_id}")

    if args.resolve_only:
        save_extraction(
            {
                "packageResolution": package_resolution,
                "productResolution": product_resolution,
            },
            args.output,
        )
        print(f"Resolution saved to {args.output}")
        return

    generated_date = args.date or generate_date()
    print("Calling Configit BOM Solve API...")
    payload = solve_bom(selected_product_id, resolved_path, generated_date)
    normalized = normalize_solve_response(payload, selected_product_id, resolved_path, generated_date)
    normalized["packageResolution"] = package_resolution
    normalized["productResolution"] = product_resolution
    save_extraction(normalized, args.output)
    print(f"Extraction saved to {args.output}")


if __name__ == "__main__":
    run_from_cli()
