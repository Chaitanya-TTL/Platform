import os
HOSTNAME = 'hnjdigisolnwnc.tatatechnologies.com'
USERNAME = os.environ.get("WINDCHILL_USERNAME", "")
PASSWORD = os.environ.get("WINDCHILL_PASSWORD", "")
VERIFY_SSL = False
DEFAULT_PART_ID = '572081'
DEFAULT_PRODUCT_NAME = 'Bike'
DEFAULT_OUTPUT = 'windchill_extraction.json'
