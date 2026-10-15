"""Safe error classification and diagnostic rendering."""
from __future__ import annotations
from .models import SourceFailure

class CodebeamerError(RuntimeError):
    classification="unknown"; retryable=False
    def __init__(self,message:str,*,operation:str="request",source_id:str|None=None,http_status:int|None=None): super().__init__(message); self.operation=operation; self.source_id=source_id; self.http_status=http_status
    def failure(self,scope:str)->SourceFailure: return SourceFailure(scope=scope,operation=self.operation,source_id=self.source_id,classification=self.classification,message=str(self),retryable=self.retryable,http_status=self.http_status)
class CodebeamerAuthenticationError(CodebeamerError): classification="authentication"
class CodebeamerPermissionError(CodebeamerError): classification="permission"
class CodebeamerNotFoundError(CodebeamerError): classification="not-found"
class CodebeamerRateLimitError(CodebeamerError): classification="rate-limit"; retryable=True
class CodebeamerTransientError(CodebeamerError): classification="transient"; retryable=True
class CodebeamerContractError(CodebeamerError): classification="contract"
class CodebeamerPaginationError(CodebeamerError): classification="pagination"
