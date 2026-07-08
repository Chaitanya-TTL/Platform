import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from config import DEFAULT_OUTPUT, DEFAULT_PART_ID, DEFAULT_PRODUCT_NAME, HOSTNAME, PASSWORD, USERNAME, VERIFY_SSL

SAMPLE_BOM_PAYLOAD_PATH = Path(__file__).resolve().with_name('sample_bom_payload.json')


def generate_date() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def load_sample_payload() -> Any:
    if SAMPLE_BOM_PAYLOAD_PATH.exists():
        with open(SAMPLE_BOM_PAYLOAD_PATH, 'r', encoding='utf-8') as fh:
            return json.load(fh)
    return {
        'value': [
            {
                'id': 'sample-root',
                'name': 'Sample Bike BOM',
                'quantity': {'value': 1, 'unit': 'EA'},
                'components': [
                    {'id': 'sample-frame', 'name': 'Frame', 'quantity': {'value': 1, 'unit': 'EA'}},
                    {'id': 'sample-wheel', 'name': 'Wheel Assembly', 'quantity': {'value': 2, 'unit': 'EA'}},
                ],
            }
        ]
    }


def get_csrf_token() -> str:
    csrf_url = f"http://{HOSTNAME}/Windchill/servlet/odata/PTC/GetCSRFToken()"
    response = requests.get(csrf_url, auth=(USERNAME, PASSWORD), verify=VERIFY_SSL, timeout=30)
    response.raise_for_status()
    payload = response.json()
    nonce = payload.get('NonceValue') or payload.get('nonceValue') or payload.get('value')
    if not nonce:
        raise RuntimeError(f"Unable to parse CSRF token from response: {response.text}")
    return nonce


def get_bom(part_id: str) -> Any:
    try:
        csrf_token = get_csrf_token()
        bom_url = f"http://{HOSTNAME}/Windchill/servlet/odata/ProdMgmt/Parts('OR:wt.part.WTPart:{part_id}')/PTC.ProdMgmt.GetPartStructure?"
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'CSRF_NONCE': csrf_token,
        }
        params = {'$expand': 'Components($levels=max)'}
        response = requests.post(bom_url, headers=headers, params=params, auth=(USERNAME, PASSWORD), verify=VERIFY_SSL, timeout=60)
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        print(f"Windchill API unavailable ({exc}). Using bundled sample payload instead.")
        return load_sample_payload()


def _pick_first(node: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if isinstance(node, dict) and key in node and node[key] is not None:
            return node[key]
    return None


def _extract_quantity(node: dict[str, Any]) -> Any:
    for key in ('quantity', 'qty', 'amount', 'count'):
        if key in node and node[key] is not None:
            value = node[key]
            if isinstance(value, dict) and 'value' in value:
                unit = value.get('unit')
                if unit:
                    return f"{value['value']} {unit}"
                return value['value']
            return value
    return None


def _extract_children(node: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ('Components', 'components', 'children', 'nodes', 'items', 'bom', 'childNodes', 'subNodes', 'boms', 'bomItems'):
        value = node.get(key)
        if isinstance(value, list):
            return value
    return []


def normalize_node(node: Any, fallback_id: str) -> dict[str, Any]:
    if not isinstance(node, dict):
        return {
            'id': fallback_id,
            'name': fallback_id,
            'quantity': None,
            'attributes': {},
            'children': [],
        }

    # Try Windchill-specific fields first, then fall back to generic
    node_id = _pick_first(node, ['PartId', 'PartNumber', 'id', 'partId', 'partNumber', 'name', 'itemId', 'nodeId'])
    name = _pick_first(node, ['PartName', 'PartNumber', 'name', 'partNumber', 'partId', 'id', 'itemId', 'nodeId'])
    quantity = _extract_quantity(node)

    attributes: dict[str, Any] = {}
    if quantity is not None:
        attributes['Quantity'] = quantity

    children: list[dict[str, Any]] = []
    for child in _extract_children(node):
        children.append(normalize_node(child, f"{fallback_id}-child"))

    return {
        'id': str(node_id or fallback_id),
        'name': str(name or fallback_id),
        'quantity': quantity,
        'attributes': attributes,
        'children': children,
    }


def normalize_bom_payload(payload: Any, part_id: str, product_name: str, generated_date: str) -> dict[str, Any]:
    if isinstance(payload, dict):
        # If the response is a Windchill GetPartStructure root object,
        # keep the root part and attach components as children.
        if 'PartId' in payload or 'PartName' in payload:
            root_node = normalize_node(payload, 'root')
            return {
                'productId': part_id,
                'productName': product_name,
                'generatedDate': generated_date,
                'bom': [root_node],
            }

        candidates = []
        # Check for OData response patterns
        for key in ('value', 'PartStructure', 'results', 'Items', 'items', 'Components', 'components', 'children', 'nodes', 'bom'):
            if key in payload and isinstance(payload[key], list):
                candidates = payload[key]
                break
        # Filter out None/empty items
        if candidates:
            candidates = [c for c in candidates if c is not None and isinstance(c, dict) and c]
        if candidates:
            top_level_nodes = [normalize_node(node, f'node-{index}') for index, node in enumerate(candidates)]
        else:
            top_level_nodes = [normalize_node(payload, 'root')]
    elif isinstance(payload, list):
        # Filter out None/empty items
        candidates = [p for p in payload if p is not None and isinstance(p, dict) and p]
        if candidates:
            top_level_nodes = [normalize_node(node, f'node-{index}') for index, node in enumerate(candidates)]
        else:
            top_level_nodes = []
    else:
        top_level_nodes = []

    return {
        'productId': part_id,
        'productName': product_name,
        'generatedDate': generated_date,
        'bom': top_level_nodes,
    }


def save_extraction(data: dict[str, Any], out_file: str) -> None:
    with open(out_file, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)


def run(part_id: str = DEFAULT_PART_ID, product_name: str = DEFAULT_PRODUCT_NAME, output: str = DEFAULT_OUTPUT) -> dict[str, Any]:
    payload = get_bom(part_id)
    # Save raw payload for debugging
    raw_output = output.replace('.json', '_raw.json')
    with open(raw_output, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2)
    
    # Extract product name from API response if available
    if isinstance(payload, dict) and ('PartId' in payload or 'PartName' in payload):
        api_product_name = payload.get('PartName') or payload.get('name') or product_name
        product_name = api_product_name
    
    generated_date = generate_date()
    normalized = normalize_bom_payload(payload, part_id, product_name, generated_date)
    normalized['source'] = 'sample-fallback' if payload == load_sample_payload() else 'windchill-api'
    save_extraction(normalized, output)
    return normalized


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Windchill BOM extractor')
    parser.add_argument('--part-id', default=DEFAULT_PART_ID, help='Windchill part id to inspect')
    parser.add_argument('--product-name', default=DEFAULT_PRODUCT_NAME, help='Product name for the extraction metadata')
    parser.add_argument('--output', default=DEFAULT_OUTPUT, help='Output JSON path')
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    run(args.part_id, args.product_name, args.output)
    print(f'Extraction saved to {args.output}')
