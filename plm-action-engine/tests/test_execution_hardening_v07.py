from datetime import datetime, timedelta, timezone
import pytest
from plm_action_engine.approval import ApprovalService
from plm_action_engine.audit import AuditRepository
from plm_action_engine.contracts import ActionPreview, ApprovalRecord, ApprovalStatus, ChangeTaskDescriptionExecutionRequest, EnterpriseSystem, TargetReference
from plm_action_engine.services import ChangeTaskDescriptionExecutionService
from plm_action_engine.storage import InMemoryApprovalRepository, InMemoryExecutionRepository, InMemoryPreviewRepository, JsonExecutionRepository, JsonFileStore

H="b"*64; TASK="OR:wt.change2.WTChangeActivity2:1715126"; NOTICE="OR:wt.change2.WTChangeOrder2:1715108"; DESC="Steering material update review v0.7"

def seeded():
 p,a=InMemoryPreviewRepository(),InMemoryApprovalRepository()
 p.save(ActionPreview(action_plan_id="plan:v07",plan_hash=H,tool_name="windchill.update_change_task_description",target=TargetReference(system=EnterpriseSystem.WINDCHILL,entity_type="CHANGE_TASK",native_id=TASK),current_values={"description":"Steering material update review","version_id":"VR:1","last_modified":"2026-10-23T07:14:22Z"},proposed_values={"description":DESC},preconditions=[],ready_for_approval=True))
 a.save(ApprovalRecord(approval_id="approval:v07",action_plan_id="plan:v07",plan_hash=H,approved_by="chaitanya",approval_reason="v0.7",status=ApprovalStatus.APPROVED,approved_at=datetime.now(timezone.utc),expires_at=datetime.now(timezone.utc)+timedelta(minutes=30)))
 return p,a

def req(key="v07-key-0001"):
 return ChangeTaskDescriptionExecutionRequest(action_plan_id="plan:v07",plan_hash=H,approval_id="approval:v07",requested_by="chaitanya",confirmation="EXECUTE_APPROVED_DESCRIPTION_UPDATE",duration=1,idempotency_key=key)

class WC:
 writes_enabled=True
 def __init__(self): self.tr=False;self.nr=False;self.desc="Steering material update review";self.patches=0
 def get_change_task_by_oid(self,o): return {"ID":TASK,"VersionID":"VR:1","LastModified":"2026-10-23T07:14:22Z","Description":self.desc,"ReservedBy":"c" if self.tr else None,"ChangeNoticeReference":{"ResourceID":f"ChangeNotices('{NOTICE}')"}}
 def get_change_notice_by_oid(self,o): return {"ID":NOTICE,"ReservedBy":"c" if self.nr else None}
 def reserve_change_notice(self,o,d): self.nr=True
 def reserve_change_task(self,o,d): self.tr=True
 def patch_change_task_description(self,o,d): self.patches+=1;self.desc=d
 def undo_change_task_reservation(self,o,d): self.tr=False
 def undo_change_notice_reservation(self,o,d): self.nr=False

def service(tmp_path, executions=None):
 p,a=seeded(); w=WC(); e=executions or InMemoryExecutionRepository()
 return ChangeTaskDescriptionExecutionService(p,a,ApprovalService(a,p),w,AuditRepository(tmp_path/'audit.jsonl'),e),a,w,e

def test_idempotent_replay_returns_same_result_without_second_patch(tmp_path):
 s,a,w,e=service(tmp_path); first=s.execute(req()); second=s.execute(req())
 assert second.execution_id==first.execution_id and w.patches==1
 assert a.get("approval:v07").consumed_by_execution_id==first.execution_id

def test_consumed_approval_rejected_for_new_key(tmp_path):
 s,a,w,e=service(tmp_path); s.execute(req())
 with pytest.raises(ValueError,match="already been consumed"): s.execute(req("v07-key-0002"))

def test_conflicting_idempotency_key_rejected(tmp_path):
 s,a,w,e=service(tmp_path); s.execute(req())
 bad=req(); bad.action_plan_id="plan:other"
 with pytest.raises(ValueError,match="different approved plan"): s.execute(bad)

def test_execution_repository_survives_reopen(tmp_path):
 repo=JsonExecutionRepository(JsonFileStore(tmp_path/'executions.json')); s,a,w,e=service(tmp_path,repo)
 result=s.execute(req()); reopened=JsonExecutionRepository(JsonFileStore(tmp_path/'executions.json'))
 assert reopened.get(result.execution_id).status=="VERIFIED_SUCCESS"
 assert reopened.find_by_idempotency_key("v07-key-0001").execution_id==result.execution_id
