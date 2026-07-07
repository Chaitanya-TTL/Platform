import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any

import requests

from config import API_KEY, BASE_URL, PACKAGE_PATH, VERIFY

HEADERS = {
    'Authorization': f'ApiKey {API_KEY}',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
}


def generate_date() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def _pick_first(value: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if isinstance(value, dict) and key in value:
            return value[key]
    return None


def _extract_quantity(node: dict[str, Any]) -> Any:
    for key in ('quantity', 'qty', 'amount', 'count'):
        if key in node and node[key] is not None:
            val = node[key]
            # Configit returns quantity as object {value, unit}
            if isinstance(val, dict) and 'value' in val:
                unit = val.get('unit')
                if unit:
                    return f"{val['value']} {unit}"
                return val['value']
            return val
    return None


def _extract_children(node: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ('children', 'nodes', 'items', 'bom', 'childNodes', 'subNodes', 'boms', 'bomItems'):
        value = node.get(key)
        if isinstance(value, list):
            return value

    # If the node contains top-level "boms" wrappers that themselves hold bomItems,
    # flatten the wrapper and return the wrapped children directly.
    bom_wrappers = node.get('boms')
    if isinstance(bom_wrappers, list):
        flattened: list[dict[str, Any]] = []
        for bom in bom_wrappers:
            if not isinstance(bom, dict):
                continue
            bom_items = bom.get('bomItems')
            if isinstance(bom_items, list) and bom_items:
                flattened.extend(bom_items)
                continue
            nested_boms = bom.get('boms')
            if isinstance(nested_boms, list) and nested_boms:
                flattened.extend(nested_boms)
                continue
        if flattened:
            return flattened

    return []


def _is_wrapper_node(node: dict[str, Any]) -> bool:
    if not isinstance(node, dict):
        return False
    has_label = any(node.get(key) for key in ('productId', 'bomItemId', 'name', 'id', 'itemId'))
    has_boms = isinstance(node.get('boms'), list) and bool(node['boms'])
    has_bom_items = isinstance(node.get('bomItems'), list) and bool(node['bomItems'])
    return not has_label and (has_boms or has_bom_items)


def normalize_nodes(node: Any, fallback_id: str) -> list[dict[str, Any]]:
    if _is_wrapper_node(node):
        flattened: list[dict[str, Any]] = []
        for child in _extract_children(node):
            flattened.extend(normalize_nodes(child, f"{fallback_id}-child"))
        return flattened

    return [normalize_node(node, fallback_id)]


def normalize_node(node: Any, fallback_id: str) -> dict[str, Any]:
    if not isinstance(node, dict):
        return {
            'id': fallback_id,
            'name': fallback_id,
            'quantity': None,
            'attributes': {},
            'children': [],
        }

    # If the node contains nested 'boms' with a bomId, prefer that as a grouping name
    if isinstance(node.get('boms'), list) and len(node.get('boms')):
        first_bom = node['boms'][0]
        bom_name = _pick_first(first_bom, ['bomId', 'id', 'name'])
        if bom_name:
            node_id = bom_name
            name = bom_name
        else:
            # fallback to regular picks
            node_id = _pick_first(node, ['bomItemId', 'nodeId', 'id', 'productId', 'itemId'])
            name = _pick_first(node, ['productId', 'bomItemId', 'name', 'nodeId', 'id', 'itemId'])
    else:
        # Prefer human-friendly identifiers for display: productId or bomItemId, fallback to nodeId
        node_id = _pick_first(node, ['bomItemId', 'nodeId', 'id', 'productId', 'itemId'])
        name = _pick_first(node, ['productId', 'bomItemId', 'name', 'nodeId', 'id', 'itemId'])
    quantity = _extract_quantity(node)

    attributes: dict[str, Any] = {}
    if quantity is not None:
        attributes['Quantity'] = quantity

    children: list[dict[str, Any]] = []
    for child in _extract_children(node):
        children.extend(normalize_nodes(child, f"{fallback_id}-child"))

    return {
        'id': str(node_id or fallback_id),
        'name': str(name or fallback_id),
        'quantity': quantity,
        'attributes': attributes,
        'children': children,
    }


def normalize_solve_response(payload: Any, product_id: str, package_path: str, generated_date: str) -> dict[str, Any]:
    top_level_nodes: list[dict[str, Any]] = []

    if isinstance(payload, list):
        top_level_nodes = [normalize_node(node, f'node-{index}') for index, node in enumerate(payload)]
    elif isinstance(payload, dict):
        # If the response wraps data under 'root' with nested 'boms', prefer the first bom's items
        root = payload.get('root') if isinstance(payload.get('root'), dict) else None
        if root and isinstance(root.get('boms'), list) and len(root['boms']) > 0:
            first_bom = root['boms'][0]
            # prefer bomItems if present
            if isinstance(first_bom.get('bomItems'), list):
                top_level_nodes = [n for i, node in enumerate(first_bom['bomItems']) for n in normalize_nodes(node, f'bomItem-{i}')]
            elif isinstance(first_bom.get('boms'), list):
                top_level_nodes = [n for i, node in enumerate(first_bom['boms']) for n in normalize_nodes(node, f'bom-{i}')]
        else:
            for key in ('nodes', 'children', 'items', 'bom'):
                value = payload.get(key)
                if isinstance(value, list):
                    top_level_nodes = [n for index, node in enumerate(value) for n in normalize_nodes(node, f'{key}-{index}')]
                    break
                if isinstance(value, dict):
                    top_level_nodes = normalize_nodes(value, key)
                    break

        if not top_level_nodes and isinstance(payload.get('result'), (dict, list)):
            return normalize_solve_response(payload['result'], product_id, package_path, generated_date)

    return {
        'productId': product_id,
        'packagePath': package_path,
        'generatedDate': generated_date,
        'bom': top_level_nodes,
    }


def solve_bom(product_id: str, package_path: str, generated_date: str | None = None) -> Any:
    body = {
        'productId': product_id,
        'date': generated_date or generate_date(),
        'nodes': [{'nodeId': 'ROOT'}],
    }
    url = f"{BASE_URL.rstrip('/')}/solve"
    response = requests.post(
        url,
        headers=HEADERS,
        params={'packagePath': package_path},
        json=body,
        verify=VERIFY,
        timeout=120,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Configit solve failed: {response.status_code} {response.text}")
    return response.json()


def save_extraction(data: dict[str, Any], out_file: str) -> None:
    with open(out_file, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)


def prompt_and_run() -> None:
    print('Configit BOM solver')
    product_id = input('Enter product ID: ').strip()
    package_path = input(f'Enter package path [{PACKAGE_PATH}]: ').strip() or PACKAGE_PATH
    generated_date = generate_date()
    print('Calling Configit BOM solve API...')
    payload = solve_bom(product_id, package_path, generated_date)
    # save raw payload for debugging
    try:
        save_extraction(payload, 'configit_raw_response.json')
    except Exception:
        pass
    normalized = normalize_solve_response(payload, product_id, package_path, generated_date)
    save_extraction(normalized, 'configit_extraction.json')
    print('Extraction saved to configit_extraction.json')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Configit BOM solve extractor')
    parser.add_argument('--product-id', required=True, help='Configit product ID')
    parser.add_argument('--package-path', default=PACKAGE_PATH, help='Configit package path')
    parser.add_argument('--date', default=None, help='Optional solve date')
    parser.add_argument('--output', default='configit_extraction.json', help='Output JSON file path')
    return parser.parse_args()


def run_from_cli() -> None:
    args = parse_args()
    print('Configit BOM solver')
    payload = solve_bom(args.product_id, args.package_path, args.date)
    # save raw payload for debugging
    try:
        save_extraction(payload, 'configit_raw_response.json')
    except Exception:
        pass
    normalized = normalize_solve_response(payload, args.product_id, args.package_path, args.date or generate_date())
    save_extraction(normalized, args.output)
    print(f'Extraction saved to {args.output}')


if __name__ == '__main__':
    if len(os.sys.argv) > 1:
        run_from_cli()
    else:
        prompt_and_run()
