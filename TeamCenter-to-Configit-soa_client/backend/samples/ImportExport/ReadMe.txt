This sample demonstrates the PLMXML and Briefcase Import\Export functionality of the Teamcenter Services.
The project must be built with Java SDK 11, from the command line using Ant(1.10.12), or from the Eclipse IDE (4.16).

Before running the sample application, you must have a Teamcenter Web Tier server
 and Pool Manager up and running.
The FCC must be installed and running on your machine. Verify that this includes the 
FMS_HOME environment variable being set.

If you want to connect to a server through IIOP protocal, use iiop:serverhost:port/serverid 
instead of http URL.

From the Command line
1. Build the application using Ant
   >ant -buildfile build.xml
2. Execute the client application
   >RunMe http://hnjpitstop3srv:8080/tc
   Substitute the URI of the Teamcenter Web Tier server
   In case of running in TCCS mode,instead of http://hostname:port/tc use tccs:<tccs_envname>
   
From the Eclipse IDE
1. Import the project
   Open the Import dialog ( File --> Import... )
   Select Existing Project into Workspace (General --> Existing Projects into Workspace )
   Click Next, then browse to .../soa_client/java/sample, select Finish
2. Compile the project  
   If the IDE is not configured to Build Automatically, force a build of the project
3. Execute the client application
   Open the Debug/Run dialog ( Run --> Debug ...)
   Select the HelloTeamcenter Java Application 
   The launch is configured to connect to the server on http://hnjpitstop3srv:8080/tc to change this URI
   on the Args tab.
   
Running in TCCS mode
1. To run in TCCS mode, ensure that TCCS and its configuration files are installed and TCCS is 
   already running.
2. Before running this sample program add the full path of soa_client/java/libs/<platform> 
   to the PATH environment variable. For windows add this path to the PATH environment variable. 
   For UNIX add this path to LD_LIBRARY_PATH or equivalent.
3. In the command line use tccs://<tccs_envname> (TCCS protocol and environment name) has the 
   host URI instead of http://hostname:port/tc

 
 The source file ImportExport.java has the main function for the application. This is the 
 best place to start browsing the code. 
 
 
 
 
