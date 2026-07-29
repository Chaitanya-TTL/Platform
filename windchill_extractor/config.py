'''HOSTNAME = 'hnjdigisolnwnc.tatatechnologies.com'
USERNAME = 'wcadmin'
PASSWORD = 'TT!user@123'
VERIFY_SSL = False
DEFAULT_PART_ID = '572081'
DEFAULT_PRODUCT_NAME = 'Bike'
DEFAULT_OUTPUT = 'windchill_extraction.json'
'''
import os

HOSTNAME = os.getenv("WINDCHILL_HOSTNAME", "hnjdigisolnwnc.tatatechnologies.com")
USERNAME = os.getenv("WINDCHILL_USERNAME", "wcadmin")
PASSWORD = os.getenv("WINDCHILL_PASSWORD", "TT!user@123")
VERIFY_SSL = os.getenv("WINDCHILL_VERIFY_SSL", "false").lower() == "true"
DEFAULT_PART_ID = os.getenv("WINDCHILL_DEFAULT_PART_ID", "572081")
DEFAULT_OUTPUT = "windchill_extraction.json"
