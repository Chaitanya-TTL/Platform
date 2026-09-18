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
 
 
MODEL_BASE_URL = "https://ttl-01.demo.configit.cloud:8443/api/v1"
def _model_url(wi,suffix): return f"{MODEL_BASE_URL}/wi/{wi}/{suffix.lstrip('/')}"
def _collection(payload,keys):
    if isinstance(payload,list): return [x for x in payload if isinstance(x,dict)]
    if isinstance(payload,dict):
        for k in tuple(keys)+("data","items","results"):
            if isinstance(payload.get(k),list): return [x for x in payload[k] if isinstance(x,dict)]
        if not payload:return []
    raise RuntimeError("Configit Model API returned an unexpected collection response.")
def _model_collection(wi,suffix,*keys): return _collection(_request_json("GET",_model_url(wi,suffix)),keys)
def resolve_work_item_by_name(requested_name: str, page_size: int = 100) -> dict[str, Any]:
    name = requested_name.strip()
    if not name:
        raise ValueError("Configit search value is required.")
    offset = 0
    total: int | None = None
    scanned = 0
    matches: list[dict[str, Any]] = []
    while True:
        payload = _request_json("GET", f"{MODEL_BASE_URL}/wi", params={"limit": page_size, "offset": offset})
        if not isinstance(payload, dict):
            raise RuntimeError("Configit work-item search returned an unexpected response.")
        page = payload.get("data")
        if not isinstance(page, list):
            raise RuntimeError("Configit work-item search response does not contain data.")
        records = [item for item in page if isinstance(item, dict)]
        for item in records:
            candidate = str(item.get("name") or "").strip()
            if candidate.casefold() == name.casefold():
                matches.append(item)
        scanned += len(records)
        pagination = payload.get("pagination") if isinstance(payload.get("pagination"), dict) else {}
        if total is None:
            try:
                total = int(pagination.get("total"))
            except (TypeError, ValueError):
                total = None
        offset += len(records)
        if not records or (total is not None and offset >= total) or len(records) < page_size:
            break
    if not matches:
        raise LookupError(f"No Configit work item named '{name}' was found across {total if total is not None else scanned} work items.")
    if len(matches) > 1:
        candidates = ", ".join(f"{item.get('id')} ({item.get('status') or 'status unavailable'})" for item in matches)
        raise RuntimeError(f"Multiple Configit work items are named '{name}'. Use a unique name. Candidates: {candidates}")
    item = matches[0]
    return {
        "input": name,
        "method": "exact-name",
        "resolvedWorkItemId": item.get("id"),
        "resolvedWorkItemName": item.get("name"),
        "description": item.get("description"),
        "status": item.get("status"),
        "scannedWorkItems": scanned,
    }


def get_work_item_product_models(work_item_id): return _model_collection(work_item_id,"products/productmodels","productModels")
def resolve_product_model(work_item_id: str, code: str | None, description: str | None, query: str | None = None) -> dict[str, Any]:
    models = get_work_item_product_models(work_item_id)
    if code:
        matches = [model for model in models if str(model.get("code") or "").strip().casefold() == code.strip().casefold()]
    elif description:
        matches = [model for model in models if str(model.get("description") or model.get("name") or "").strip().casefold() == description.strip().casefold()]
    else:
        term = (query or "").strip().casefold()
        code_matches = [model for model in models if str(model.get("code") or "").strip().casefold() == term]
        description_matches = [model for model in models if str(model.get("description") or model.get("name") or "").strip().casefold() == term]
        matches = code_matches or description_matches or (models if len(models) == 1 else [])
    if len(matches) == 1:
        return matches[0]
    candidates = ", ".join(f"{model.get('code')} ({model.get('description') or model.get('name') or 'unnamed'})" for model in matches or models)
    if len(matches) > 1:
        raise RuntimeError(f"Multiple product models match the Configit search. Candidates: {candidates}")
    raise RuntimeError(f"A unique product model could not be selected. Candidates: {candidates}")

def get_library_families(wi): return _model_collection(wi,"library/families","families")
def get_library_features(wi): return _model_collection(wi,"library/features","features")
def get_library_properties(wi): return _model_collection(wi,"library/properties","properties")
def get_product_model(wi,code):
    x=_request_json("GET",_model_url(wi,f"products/productmodels/{code}"));return x.get("data",x) if isinstance(x,dict) else {}
def get_product_families(wi,code): return _model_collection(wi,f"products/productmodels/{code}/families","families")
def get_product_rules(wi,code): return _model_collection(wi,f"products/productmodels/{code}/rules","rules")
def get_product_views(wi,code): return _model_collection(wi,f"products/productmodels/{code}/views","views")
def get_languages(wi): return _model_collection(wi,"localizations/languages","languages")
def get_family_translations(wi): return _model_collection(wi,"localizations/families","translations","familyTranslations")
def get_feature_translations(wi): return _model_collection(wi,"localizations/features","translations","featureTranslations")
def get_section_translations(wi): return _model_collection(wi,"localizations/sections","translations","sectionTranslations")
def _features(v):
    x=v.get("features") or v.get("featureValues") or [];return [i for i in x if isinstance(i,dict)] if isinstance(x,list) else []
def _normal_family(v): return {"code":v.get("code"),"name":v.get("description") or v.get("name") or v.get("code"),"familyType":v.get("familyType") or v.get("type"),"features":[{"code":f.get("code"),"name":f.get("description") or f.get("name") or f.get("code")} for f in _features(v)]}
def _normal_rule(v):
    e=v.get("errorTypes") or v.get("errors") or [];return {"code":v.get("code"),"description":v.get("description") or v.get("code"),"expression":v.get("text") or v.get("expression") or "","enabled":v.get("isEnabled",v.get("enabled")),"locked":v.get("isLocked",v.get("locked")),"effectivity":v.get("effectivity") or {},"validation":{"valid":not bool(e),"errorTypes":e}}
def _normal_translation(v):
    d=v.get("translationDeclaration") if isinstance(v.get("translationDeclaration"),dict) else {};return {"code":v.get("code") or v.get("familyCode") or v.get("featureCode") or v.get("sectionCode"),"sourceText":v.get("sourceText") or v.get("description") or v.get("originalText"),"translatedText":v.get("translation") or v.get("translatedText") or v.get("text"),"languageCode":v.get("languageCode") or v.get("language"),"declarationCode":d.get("code") or v.get("translationDeclarationCode")}
def extract_work_item_model(args: argparse.Namespace) -> dict[str, Any]:
    resolution = resolve_work_item_by_name(args.query)
    work_item_id = str(resolution["resolvedWorkItemId"])
    selected = resolve_product_model(work_item_id, args.product_model_code, args.product_model_description, args.query)
    model_code = str(selected.get("code") or "").strip()
    try:
        detail = get_product_model(work_item_id, model_code)
        if detail:
            selected = detail
    except RuntimeError as error:
        if "returned 404" not in str(error):
            raise
    families = [_normal_family(value) for value in get_product_families(work_item_id, model_code)]
    library_families = [_normal_family(value) for value in get_library_families(work_item_id)] if args.include_library else []
    library_features = get_library_features(work_item_id) if args.include_library else []
    properties = get_library_properties(work_item_id) if args.include_library else []
    rules = [_normal_rule(value) for value in get_product_rules(work_item_id, model_code)] if args.include_rules else []
    views = get_product_views(work_item_id, model_code) if args.include_views else []
    languages = get_languages(work_item_id) if args.include_localizations else []
    family_translations = [_normal_translation(value) for value in get_family_translations(work_item_id)] if args.include_localizations else []
    feature_translations = [_normal_translation(value) for value in get_feature_translations(work_item_id)] if args.include_localizations else []
    section_translations = [_normal_translation(value) for value in get_section_translations(work_item_id)] if args.include_localizations else []
    return {
        "available": True,
        "workItemId": int(work_item_id) if work_item_id.isdigit() else work_item_id,
        "workItemResolution": resolution,
        "productModel": {"code": selected.get("code") or model_code, "description": selected.get("description") or selected.get("name"), "brandCode": selected.get("brandCode"), "useArithmeticRules": selected.get("useArithmeticRules"), "languageCodes": selected.get("languageCodes") or [], "translationDeclarationCodes": selected.get("translationDeclarationCodes") or []},
        "library": {"families": library_families, "features": library_features, "properties": properties},
        "configuration": {"families": families, "rules": rules, "views": views},
        "localization": {"languages": languages, "familyTranslations": family_translations, "featureTranslations": feature_translations, "sectionTranslations": section_translations},
        "warnings": [],
    }

def extract_published_package(args):
    pr=resolve_latest_package_path(args.package_path);rp=pr["resolvedPackagePath"];pp=get_package_products(rp);sel=resolve_product_id(pp,args.product_id);pid=str(sel["selectedProductId"]);date=args.date or generate_date();bom=[] if args.resolve_only else normalize_solve_response(solve_bom(pid,rp,date),pid,rp,date)["bom"];return {"available":True,"packageResolution":pr,"productResolution":sel,"productId":pid,"packagePath":rp,"generatedDate":date,"bom":bom,"warnings":[]}
def unavailable(error): return {"available":False,"error":{"code":"extraction_failed","message":str(error)},"warnings":[]}

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Unified Configit package and work-item search")
    parser.add_argument("--query", required=True, help="Package path or exact work-item name")
    parser.add_argument("--output", default="configit_extraction.json")
    parser.add_argument("--date", default=None)
    parser.add_argument("--product-id", default=None)
    parser.add_argument("--product-model-code", default=None)
    parser.add_argument("--product-model-description", default=None)
    parser.add_argument("--resolve-only", action="store_true")
    parser.add_argument("--include-library", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--include-rules", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--include-localizations", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--include-views", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args()


def _reason(error: Exception | None) -> str | None:
    if error is None:
        return None
    value = str(error).lower()
    return "not_found" if isinstance(error, LookupError) or "404" in value or "not found" in value or "no latest version" in value else "technical_failure"


def run_from_cli() -> None:
    args = parse_args()
    package: dict[str, Any] = {"available": False, "warnings": []}
    authoring: dict[str, Any] = {"available": False, "warnings": []}
    package_error: Exception | None = None
    authoring_error: Exception | None = None
    try:
        package = extract_published_package(args)
    except Exception as error:
        package_error = error
        package = {**unavailable(error), "reason": _reason(error)}
    try:
        authoring = extract_work_item_model(args)
    except Exception as error:
        authoring_error = error
        authoring = {**unavailable(error), "reason": _reason(error)}
    package_ok, authoring_ok = bool(package.get("available")), bool(authoring.get("available"))
    if package_ok or authoring_ok:
        technical = _reason(package_error) == "technical_failure" or _reason(authoring_error) == "technical_failure"
        status = "partial_success" if technical else "success"
    elif _reason(package_error) == "not_found" and _reason(authoring_error) == "not_found":
        status = "not_found"
    else:
        status = "failed"
    result = {
        "schemaVersion": "2.0",
        "source": "configit",
        "query": args.query,
        "status": status,
        "extractedAt": generate_date(),
        "publishedPackage": package,
        "authoringWorkItem": authoring,
        "correlation": {"packageProductId": package.get("productId"), "workItemProductModelCode": (authoring.get("productModel") or {}).get("code"), "method": "exact-query" if package_ok and authoring_ok else "single-source"},
        "warnings": [*package.get("warnings", []), *authoring.get("warnings", [])],
    }
    if package_ok:
        result.update({"productId": package.get("productId"), "packagePath": package.get("packagePath"), "generatedDate": package.get("generatedDate"), "bom": package.get("bom", []), "packageResolution": package.get("packageResolution"), "productResolution": package.get("productResolution")})
    save_extraction(result, args.output)
    print(f"Unified Configit search completed with status: {status}")


if __name__ == "__main__":
    run_from_cli()
