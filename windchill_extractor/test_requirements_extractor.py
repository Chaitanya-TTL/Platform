import sys,types,unittest
from unittest.mock import patch
config=types.ModuleType("config");config.HOSTNAME="http://windchill.test";config.USERNAME="user";config.PASSWORD="secret";config.VERIFY_SSL=False;sys.modules["config"]=config
import requirements_extractor as r
class Tests(unittest.TestCase):
 def test_identity(self):self.assertEqual(r.ident("REQ-1 - Material Requirement"),("REQ-1","Material Requirement"))
 def test_invalid_oid(self):
  with self.assertRaises(SystemExit):r.valid("http://bad","OR:wt.doc.WTDocument:")
 def test_ambiguity(self):
  with patch.object(r,"parts",return_value=[{"ID":"1"},{"ID":"2"}]):self.assertEqual(r.extract("part-name","x")["code"],"PART_NAME_AMBIGUOUS")
 def test_categories(self):self.assertEqual(r.category("Maximum Weight Requirement"),"Weight")
if __name__=="__main__":unittest.main()
