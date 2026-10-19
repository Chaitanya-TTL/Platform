"""Atomic file-backed catalog persistence with integrity verification."""
import hashlib,json,os
from pathlib import Path
from typing import Any
from .models import CatalogSnapshot,SyncState
class CatalogIntegrityError(RuntimeError):pass
def _canonical(value:Any)->str:return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))
def _hash(payload:dict[str,Any])->str:
    value=dict(payload);value.pop("integrity_hash",None);return "sha256:"+hashlib.sha256(_canonical(value).encode()).hexdigest()
class FileCatalogRepository:
    def __init__(self,data_dir:str|Path):self.data_dir=Path(data_dir);self.catalog_file=self.data_dir/"catalog.json";self.sync_file=self.data_dir/"sync-state.json"
    def _write(self,path:Path,payload:dict[str,Any])->None:
        path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name(f"{path.name}.{os.getpid()}.tmp");tmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8");os.replace(tmp,path)
    def save_catalog(self,snapshot:CatalogSnapshot)->None:
        payload=snapshot.model_dump(mode="json");payload["integrity_hash"]=_hash(payload);self._write(self.catalog_file,payload)
    def load_catalog(self)->CatalogSnapshot|None:
        if not self.catalog_file.exists():return None
        payload=json.loads(self.catalog_file.read_text(encoding="utf-8-sig"));expected=payload.get("integrity_hash")
        if not expected or expected!=_hash(payload):raise CatalogIntegrityError("Codebeamer catalog integrity verification failed.")
        return CatalogSnapshot.model_validate(payload)
    def save_sync_state(self,state:SyncState)->None:self._write(self.sync_file,state.model_dump(mode="json"))
    def load_sync_state(self)->SyncState|None:return SyncState.model_validate_json(self.sync_file.read_text(encoding="utf-8-sig")) if self.sync_file.exists() else None
