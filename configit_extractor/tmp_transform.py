import json
from pathlib import Path

p = Path('configit_raw_response.json')
obj = json.loads(p.read_text())


def as_record(x):
    return x if isinstance(x, dict) else None

def get_string(x):
    return x if isinstance(x, str) else None

def get_number_or_string(x):
    return x if isinstance(x, (str, int, float, bool)) else None

def get_array(x):
    return x if isinstance(x, list) else None


def transform_configit_nodes(node, fallback_id):
    obj = as_record(node)
    if not obj:
        return []

    raw_qty = obj.get('quantity') or obj.get('qty') or obj.get('amount') or obj.get('count')
    quantity = None
    if isinstance(raw_qty, dict) and 'value' in raw_qty:
        quantity = f"{raw_qty.get('value')} {raw_qty.get('unit','')}".strip()
    elif isinstance(raw_qty, (str, int, float, bool)):
        quantity = raw_qty

    child_values = get_array(obj.get('children')) or get_array(obj.get('nodes')) or get_array(obj.get('items')) or get_array(obj.get('bom')) or get_array(obj.get('bomItems')) or get_array(obj.get('boms'))
    children = []
    if child_values:
        for index, child in enumerate(child_values):
            children.extend(transform_configit_nodes(child, f"{fallback_id}-{index}"))

    is_bom_wrapper = not get_string(obj.get('productId')) and not get_string(obj.get('bomItemId')) and not get_string(obj.get('name')) and ((get_array(obj.get('bomItems')) and len(obj.get('bomItems'))>0) or (get_array(obj.get('boms')) and len(obj.get('boms'))>0))
    if is_bom_wrapper and children:
        return children

    _id = get_string(obj.get('productId')) or get_string(obj.get('bomItemId')) or get_string(obj.get('bomId')) or get_string(obj.get('nodeId')) or get_string(obj.get('id')) or fallback_id
    name = get_string(obj.get('productId')) or get_string(obj.get('bomItemId')) or get_string(obj.get('bomId')) or get_string(obj.get('name')) or get_string(obj.get('nodeId')) or get_string(obj.get('id')) or 'Configit node'
    attributes = {}
    if quantity is not None:
        attributes['Quantity'] = quantity
    return [{
        'id': str(_id),
        'name': str(name),
        'attributes': attributes,
        'children': children,
    }]

root = obj.get('root') or obj
transformed = transform_configit_nodes(root, 'configit-root')
print('transformed count', len(transformed))
print(json.dumps(transformed, indent=2))