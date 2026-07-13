import requests
hostname = "hnjdigisolnwnc.tatatechnologies.com"
username = "wcadmin"
password = "TT!user@123"
PartId = 572081
OptionsetID=549397 
productName='Bike'
BIKEPartId= '3A569700'
ReportTemplateId='551099'
source_part_id='570415'
context_id='569700'
folder_id='572585'

def get_csrf_token():
    csrf_url = f"http://{hostname}/Windchill/servlet/odata/PTC/GetCSRFToken()"

    print(f"Calling CSRF URL: {csrf_url}")
    
    response = requests.get(
        csrf_url,
        auth=(username, password)
    )
    

    print(f"CSRF Response status: {response.status_code}")
    print(f"CSRF Response content: {response.text}")
    
    return response.json()['NonceValue']

def get_bom():
    csrf_token = get_csrf_token()
    print("bom")
    bom_url = f"http://{hostname}/Windchill/servlet/odata/ProdMgmt/Parts('OR:wt.part.WTPart:{PartId}')/PTC.ProdMgmt.GetPartStructure?"

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    params_bom = {
        "$expand": "Components($levels=max)"
    }
    
    response = requests.post(
        bom_url,
        headers=headers,
        params=params_bom,
        auth=(username, password)
    )
    return response.json()

def get_assigned_expression(part_id):
    csrf_token = get_csrf_token()
    print(f"Getting assigned expression for part ID: {part_id}")
    
    expression_url = f"http://{hostname}/Windchill/servlet/odata/ProdMgmt/Parts('OR:wt.part.WTPart:{part_id}')/PTC.ProdMgmt.GetAssignedExpression()"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    response = requests.get(
        expression_url,
        headers=headers,
        auth=(username, password)
    )
    
    return response.json()

def getoptions(option_set_id):
    csrf_token = get_csrf_token()
    print(f"Getting options for option set ID: {option_set_id}")
    
    options_url = f"http://{hostname}/Windchill/servlet/odata/ProdPlatformMgmt/OptionSets('OR:com.ptc.windchill.option.model.OptionSet:{option_set_id}')/Options"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    params_options = {
        "$expand": "Choices,OptionGroup"
    }
    
    response = requests.get(
        options_url,
        headers=headers,
        params=params_options,
        auth=(username, password)
    )
    
    return response.json()

def get_parts_by_product():
    csrf_token = get_csrf_token()
    print(f"Getting parts for product: {productName}")
    
    parts_url = f"http://{hostname}/Windchill/servlet/odata/ProdMgmt/Parts"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    params_parts = {
        "$filter": f"Context/Name eq ('WCI INTEG Prod')",
        "$expand": "UsedBy"
    }
    
    response = requests.get(
        parts_url,
        headers=headers,
        params=params_parts,
        auth=(username, password)
    )
    
    return response.json()

def get_part_details(part_id):
    csrf_token = get_csrf_token()
    print(f"Getting details for part ID: {part_id}")
    
    # Format similar to other API calls in the codebase
    part_url = f"http://{hostname}/Windchill/servlet/odata/ProdMgmt/Parts('OR:wt.part.WTPart:{part_id}')"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    params = {
        "$expand": "UsedBy"
    }
    
    response = requests.get(
        part_url,
        headers=headers,
        params=params,
        auth=(username, password)
    )
    
    return response.json()

def get_optionsets():
    csrf_token = get_csrf_token()
    print("options sets")
    
    # New URL that filters by product name and excludes cancelled state
    optionsets_url = f"http://{hostname}/Windchill/servlet/odata/v5/ProdPlatformMgmt/OptionSets"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    params_optionssets = {
        "$filter": f"Context/Name eq '{productName}' and State/Value ne 'CANCELLED'",
        "$expand": "Context"
    }
    
    response = requests.get(
        optionsets_url,
        headers=headers,
        params=params_optionssets,
        auth=(username, password)
    )
    return response.json()

def execute_report_template():
    csrf_token = get_csrf_token()
    print(f"Executing report template")
    
    report_url = f"http://{hostname}/Windchill/servlet/odata/Reporting/ExecuteReportTemplate"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    payload = {
  "Name": "Ace_Export_Conditional_Rules",
  "ContainerPath": "/",
  "Criteria": []
    }
    
    response = requests.post(
        report_url,
        headers=headers,
        json=payload,
        auth=(username, password)
    )
    
    print(f"Report execution status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Error response: {response.text}")
        
    return response.json()

def create_downstream_part_request(source_part_id, context_id, folder_id):
    csrf_token = get_csrf_token()
    print(f"Creating downstream part request for source part ID: {source_part_id}")
    
    downstream_url = f"http://{hostname}/Windchill/servlet/odata/BomTransformation/NewDownstreamPart"
    
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "CSRF_NONCE": csrf_token
    }
    
    payload = {
        "DownstreamNavigationCriteria": {
            "ApplicableType": "PTC.ProdMgmt.Part",
            "ApplicationName": None,
            "ApplyToTopLevelObject": False,
            "Centricity": False,
            "ConfigSpecs": [
                {
                    "@odata.type": "#PTC.NavCriteria.WTPartStandardConfigSpec",
                    "WorkingIncluded": False,
                    "View": "Manufacturing",
                    "LifeCycleState": None
                }
            ],
            "Filters": [],
            "HideUnresolvedDependents": True,
            "SharedToAll": False,
            "UseDefaultForUnresolved": False
        },
        "UpstreamNavigationCriteria": {
            "ApplicableType": "PTC.ProdMgmt.Part",
            "ApplicationName": None,
            "ApplyToTopLevelObject": False,
            "Centricity": False,
            "ConfigSpecs": [
                {
                    "@odata.type": "#PTC.NavCriteria.WTPartStandardConfigSpec",
                    "WorkingIncluded": False,
                    "View": "Design",
                    "LifeCycleState": None
                }
            ],
            "Filters": [],
            "HideUnresolvedDependents": True,
            "SharedToAll": False,
            "UseDefaultForUnresolved": False
        },
        "TransformationDefinitions": [
            {
                "SourcePart@odata.bind": f"Parts('VR:wt.part.WTPart:{source_part_id}')",
                "ReviseExistingDownstream": False,
                "TransformationOption": "DoNotDuplicate",
                "TransformationEntity": {
                    "Name": "WCINTEGMBOM",
                    "View": "Manufacturing",
                    "Context@odata.bind": f"Containers('OR:wt.pdmlink.PDMLinkProduct:{context_id}')",
                    "Folder@odata.bind": f"Folders('OR:wt.folder.SubFolder:{folder_id}')"
                }
            }
        ]
    }

    response = requests.post(
        downstream_url,
        headers=headers,
        json=payload,
        auth=(username, password)
    )
    
    print(f"Downstream part request status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Error response: {response.text}")
        
    return response.json()

if __name__ == "__main__":
    try:
        #bom_data = get_bom()
        #print("BOM Data:", bom_data)
        options=getoptions(OptionsetID)
        print("options:",options)
        #parts=get_parts_by_product()
        #print("parts:",parts)
        #part_details = get_part_details(PartId)
        #print(f"Details for Part ID {PartId}:", part_details)
        #assigned_expression = get_assigned_expression(PartId)
        #print("Assigned Expression:", assigned_expression)
        #optionsets=get_optionsets()
        #print("optionsets:",optionsets)
        #report_data = execute_report_template()
        #print("Report Data:", report_data)
        #downstream_result = create_downstream_part_request(source_part_id, context_id, folder_id)
        #print("Downstream Part Request Result:", downstream_result)
    except Exception as e:
        print(f"Error retrieving BOM: {str(e)}")
