import requests
import json
import os
from urllib.parse import urljoin
from urllib3.util import Retry
from requests.adapters import HTTPAdapter

# Minimal extractor for Configit: fetch families and their features for a given work item and product model.
# Default Configit settings are embedded so you can run the script without extra environment setup.
from config import BASE_URL, API_KEY, VERIFY
HEADERS = {'Authorization': f'Apikey {API_KEY}', 'Content-Type': 'application/json', 'Accept': 'application/json'}


def extract_list_items(data, key_hints=None):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        key_hints = key_hints or ['families', 'items', 'content', 'features']
        for key in key_hints:
            if key in data and isinstance(data[key], list):
                return data[key]
        for value in data.values():
            if isinstance(value, list):
                return value
    return []


def find_next_url(data):
    if not isinstance(data, dict):
        return None
    if data.get('next'):
        next_value = data['next']
        if isinstance(next_value, str):
            return next_value
        if isinstance(next_value, dict):
            return next_value.get('href') or next_value.get('url')
    for parent in ('links', 'paging', 'page'):
        parent_value = data.get(parent)
        if isinstance(parent_value, dict):
            if parent_value.get('next'):
                next_value = parent_value['next']
                if isinstance(next_value, str):
                    return next_value
                if isinstance(next_value, dict):
                    return next_value.get('href') or next_value.get('url')
        if isinstance(parent_value, str) and parent == 'next':
            return parent_value
    return None


def fetch_json_list(url: str, key_hints=None):
    items = []
    current_url = url
    while current_url:
        r = SESSION.get(current_url, headers=HEADERS, verify=VERIFY)
        if r.status_code != 200:
            raise RuntimeError(f"Failed to fetch list from {current_url}: {r.status_code} {r.text}")
        data = r.json()
        page_items = extract_list_items(data, key_hints)
        items.extend(page_items)
        next_url = find_next_url(data)
        if not next_url:
            break
        current_url = next_url if next_url.startswith('http') else urljoin(current_url, next_url)
    return items


# session with retries
def make_session(retries=3, backoff_factor=0.3, status_forcelist=(500, 502, 503, 504)):
    s = requests.Session()
    retry = Retry(total=retries, read=retries, connect=retries, backoff_factor=backoff_factor,
                  status_forcelist=status_forcelist, allowed_methods=["GET"])
    adapter = HTTPAdapter(max_retries=retry)
    s.mount('http://', adapter)
    s.mount('https://', adapter)
    return s

SESSION = make_session()


def fetch_family(wi_id: str, product_model: str, family_code: str):
    url = f"{BASE_URL}{wi_id}/products/productmodels/{product_model}/families/{family_code}"
    r = SESSION.get(url, headers=HEADERS, verify=VERIFY)
    if r.status_code != 200:
        raise RuntimeError(f"Failed to fetch family {family_code}: {r.status_code} {r.text}")
    return r.json()


def fetch_features(wi_id: str, product_model: str, family_code: str):
    url = f"{BASE_URL}{wi_id}/products/productmodels/{product_model}/families/{family_code}/features"
    features = fetch_json_list(url, key_hints=['features'])
    return features


def list_families(wi_id: str, product_model: str):
    """List families for a product model; returns list of family codes."""
    url = f"{BASE_URL}{wi_id}/products/productmodels/{product_model}/families"
    family_list = fetch_json_list(url, key_hints=['families', 'items', 'content'])
    codes = []
    for f in family_list:
        if isinstance(f, dict) and 'code' in f:
            codes.append(f['code'])
        elif isinstance(f, str):
            codes.append(f)
    return codes


def build_extraction(wi_id: str, product_model: str, family_codes: list):
    result = {'workItem': wi_id, 'productModel': product_model, 'content': [], 'view': []}
    for code in family_codes:
        fam = fetch_family(wi_id, product_model, code)
        features = fetch_features(wi_id, product_model, code)
        # normalize feature list
        feat_list = features.get('features') if isinstance(features, dict) and 'features' in features else features
        result['content'].append({
            'code': fam.get('code'),
            'description': fam.get('description'),
            'familyType': fam.get('familyType'),
            'labels': fam.get('labels'),
            'isCalculated': fam.get('isCalculated'),
            'isPrivate': fam.get('isPrivate'),
            'features': [{'code': f.get('code'), 'description': f.get('description')} for f in feat_list]
        })

    # simple view: list family codes
    result['view'].append({'description': 'Extracted View', 'families': [c['code'] for c in result['content']]})
    return result


def save_extraction(data: dict, out_file: str):
    with open(out_file, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)


def prompt_and_run():
    print('Configit extractor')
    wi_id = input("Enter Configit work item id (or 'none' for Master): ").strip()
    product_model = input("Enter product model code: ").strip()
    print('Discovering families for the product model...')
    family_codes = list_families(wi_id, product_model)
    if not family_codes:
        print('No families discovered. Verify the product model code and work item id.')
        return
    print(f"Found {len(family_codes)} families. Extracting...")
    out_name = f"configit_extraction.json"
    data = build_extraction(wi_id, product_model, family_codes)
    save_extraction(data, out_name)
    print(f"Extraction saved to {out_name}")



if __name__ == '__main__':
    prompt_and_run()
